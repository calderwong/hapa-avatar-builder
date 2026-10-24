// Echo visual-score projection over one saved Atlas run, plus an append-only
// ledger of saved directions (human/agent intent) per Song. Composition never
// writes Atlas results, reviews, Songs or Director projects.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import {
  buildEchoMusicalTimelineFromAtlas, composeEchoVisualScore, validateEchoVisualScore, validateEchoScoreDirection,
  normalizeDustPlaySettings, ECHO_SCORE_DIRECTION_SCHEMA, echoAtlasRunShape, selectEchoScoreDustRun,
} from '../src/domain/echo-visual-score.js';
import { DUST_LOOK_SCHEMA, dustLookSlug, validateDustLook, mergeDustLooks } from '../src/domain/echo-score-dust-looks.js';
import { albumDustColour } from '../src/domain/echo-score-dust-album.js';
import { suggestDustDirection, interpretDustCue } from '../src/domain/echo-score-dust-director.js';

function songCardFor(songs,songId){const list=typeof songs==='function'?songs():songs||[];return list.find(s=>[s?.id,s?.songId,s?.cardId].includes(songId))||null;}

/** A starting direction from the Song's mood/tags, Atlas structure and lyrics (local rules, no provider). */
export function suggestVisualScoreDirection(result,input={},{songs=[]}={}){
 const timeline=buildEchoMusicalTimelineFromAtlas(result),card=songCardFor(songs,result.song_id);
 const lyricLines=parseValue(input.lyricLines,'lyricLines',{array:true});
 const tags=Array.isArray(input.tags)?input.tags.map(String):typeof input.tags==='string'&&input.tags?input.tags.split(','):card?.tags||[];
 const suggestion=suggestDustDirection({timeline,mood:typeof input.mood==='string'?input.mood:card?.mood||'',tags,lyricLines,title:card?.title||''});
 const score=composeEchoVisualScore(timeline,suggestion.direction,{lyricLines});
 return {...suggestion,run_id:result.run_id,song_id:result.song_id,validation:validateEchoVisualScore(score,{timeline}),notice:'Suggested locally from mood words, Atlas candidates and lyrics; nothing is saved.'};
}

/**
 * The run every Score Dust surface composes from (see selectEchoScoreDustRun).
 * Completed results are immutable, so shapes are cached by run id + result hash.
 */
export function createVisualScoreRunSelector({jobs,result}){
 const shapes=new Map();
 return function visualScoreRun(songId){
  if(typeof songId!=='string'||!songId)throw fail('songId required',400);
  const complete=jobs(songId).filter(job=>job.state==='complete');
  const hashes=new Map(complete.map(job=>[job.id,job.result_sha256]));
  const shapeOf=id=>{
   const key=`${id}:${hashes.get(id)}`;
   if(!shapes.has(key)){try{shapes.set(key,echoAtlasRunShape(buildEchoMusicalTimelineFromAtlas(result(id))));}catch(error){shapes.set(key,{error:String(error?.message||error)});}}
   return shapes.get(key);
  };
  const selected=selectEchoScoreDustRun(complete.map(job=>({id:job.id,createdAt:job.created_at})),shapeOf);
  return {schema_version:'hapa.audio-atlas.visual-score-run.v1',song_id:songId,run:selected.run,basis:selected.basis,reason:selected.reason,candidates:selected.candidates};
 };
}

/** Apply a plain-language cue to a direction (the request's, else the latest saved one). */
export function interpretVisualScoreCue(result,input={},{saved=null}={}){
 const timeline=buildEchoMusicalTimelineFromAtlas(result);
 if(typeof input.text!=='string'||!input.text.trim()||input.text.length>2000)throw fail('text must be a cue of 1–2000 characters');
 const base=parseValue(input.direction,'direction')||(saved&&validateEchoScoreDirection(saved.direction).ok?saved.direction:{});
 const lyricLines=parseValue(input.lyricLines,'lyricLines',{array:true});
 const before=composeEchoVisualScore(timeline,validateEchoScoreDirection(base).ok?base:{},{lyricLines});
 const value=interpretDustCue(input.text,{timeline,score:before,direction:base});
 const check=validateEchoScoreDirection(value.direction);
 const score=check.ok?composeEchoVisualScore(timeline,value.direction,{lyricLines}):null;
 return {...value,run_id:result.run_id,song_id:result.song_id,directionValidation:check,validation:score?validateEchoVisualScore(score,{timeline}):null,notice:'Interpreted locally; nothing is saved. Save the returned direction to keep it.'};
}

/** "album" without a stored spec resolves from the Song store, then composes like any preset. */
function withAlbumColour(direction,songs,songId){
 if(direction?.colour?.preset!=='album'||direction.colour.album)return direction;
 const album=albumDustColour(typeof songs==='function'?songs():songs||[],songId);
 return album?{...direction,colour:{...direction.colour,album}}:direction;
}

const fail=(message,statusCode=422)=>Object.assign(new Error(`Visual score: ${message}`),{statusCode});
const MAX_INPUT_BYTES=64*1024;
const MAX_LYRIC_LINES=2000;

function parseValue(value,label,{array=false}={}){
 if(value==null||value==='')return null;
 if(typeof value==='string'){if(value.length>MAX_INPUT_BYTES*4)throw fail(`${label} is too large`);try{value=JSON.parse(value);}catch{throw fail(`${label} must be JSON`);}}
 if(array?!Array.isArray(value):typeof value!=='object'||Array.isArray(value))throw fail(`${label} must be ${array?'an array':'an object'}`);
 if(JSON.stringify(value).length>MAX_INPUT_BYTES*(array?8:4))throw fail(`${label} is too large`);
 return value;
}

/** Append-only per-Song ledger. Each revision names the run and timeline it was composed against. */
export function createVisualScoreDirectionStore({dir,lock,release}){
 const file=songId=>path.join(dir,`${createHash('sha256').update(String(songId)).digest('hex').slice(0,32)}.ndjson`);
 function list(songId){
  if(typeof songId!=='string'||!songId)throw fail('Song id required',400);
  const target=file(songId);if(!fs.existsSync(target))return {songId,revisions:[],latest:null,ignoredLines:0};
  let ignoredLines=0;const revisions=[];
  for(const line of fs.readFileSync(target,'utf8').split('\n')){
   if(!line.trim())continue;
   // A torn final write is reported, never repaired or guessed.
   try{const row=JSON.parse(line);if(row.schemaVersion===ECHO_SCORE_DIRECTION_SCHEMA&&row.songId===songId)revisions.push(row);else ignoredLines++;}catch{ignoredLines++;}
  }
  return {songId,revisions,latest:revisions.at(-1)||null,ignoredLines};
 }
 function append(songId,record){
  const lease=lock();
  try{
   const current=list(songId),latest=current.latest?.revision||0;
   if(record.baseRevision!==latest)throw fail(`Direction revision conflict: base ${record.baseRevision}, latest ${latest}`,409);
   const row={schemaVersion:ECHO_SCORE_DIRECTION_SCHEMA,songId,revision:latest+1,...record,createdAt:new Date().toISOString()};
   fs.mkdirSync(dir,{recursive:true});
   const fd=fs.openSync(file(songId),'a',0o600);
   try{fs.writeSync(fd,`${JSON.stringify(row)}\n`);fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
   return row;
  }finally{release(lease);}
 }
 return {list,append};
}

/**
 * {direction?, score?, assets?, lyricLines?, lyricAudioHash?, playSettings?, useSaved?}
 * → timeline, score, validation and play settings. Without a request direction
 * the Song's latest saved direction is used, so UI, API and CLI agree.
 */
export function atlasVisualScore(result,input={},{saved=null,songs=[]}={}){
 const timeline=buildEchoMusicalTimelineFromAtlas(result);
 const requested=parseValue(input.direction,'direction');
 const useSaved=input.useSaved!==false&&input.useSaved!=='false';
 if(requested){const check=validateEchoScoreDirection(requested);if(!check.ok)throw fail(`invalid direction: ${check.errors.map(e=>e.message).join(' ')}`);}
 // A saved revision that no longer validates is reported and skipped, never fatal to reads.
 const savedUsable=Boolean(useSaved&&saved&&validateEchoScoreDirection(saved.direction).ok);
 const direction=withAlbumColour(requested||(savedUsable?saved.direction:{}),songs,result.song_id);
 const lyricLines=parseValue(input.lyricLines,'lyricLines',{array:true});
 if(lyricLines&&lyricLines.length>MAX_LYRIC_LINES)throw fail(`at most ${MAX_LYRIC_LINES} lyric lines`);
 const supplied=parseValue(input.score,'score');
 const score=supplied||composeEchoVisualScore(timeline,direction,{lyricLines,lyricAudioHash:typeof input.lyricAudioHash==='string'?input.lyricAudioHash:null});
 const assets=Array.isArray(input.assets)?input.assets.map(String):typeof input.assets==='string'&&input.assets?input.assets.split(','):null;
 const play=parseValue(input.playSettings,'playSettings')||direction.playSettings||{};
 const playSettings=normalizeDustPlaySettings({...play,...(input.pulse?{pulse:input.pulse}:{}),...(input.seed!==undefined&&input.seed!==''?{seed:Number(input.seed)}:{}),...(input.particleCount?{particleCount:input.particleCount}:{})},timeline);
 return {schema_version:'hapa.audio-atlas.visual-score-response.v1',run_id:result.run_id,song_id:result.song_id,score_origin:supplied?'supplied':'composed',
  direction_source:requested?'request':savedUsable?`saved:r${saved.revision}`:useSaved&&saved?`default (saved r${saved.revision} is invalid)`:'default',direction,
  // Repeat-group names belong to one analysis; a direction saved on another run may not line up.
  direction_timeline_matches:requested||!savedUsable?null:saved.timelineFingerprint===timeline.fingerprint,
  timeline,score,validation:validateEchoVisualScore(score,{timeline,assets}),playSettings,
  notice:'Read-only projection of Atlas candidates. Repeat groups, events and tempo alternatives are unreviewed evidence.'};
}

/** Validate a direction against the run it was authored on, then append it. */
export function saveVisualScoreDirection(result,store,input={},{songs=[]}={}){
 const parsed=parseValue(input.direction,'direction');
 if(!parsed)throw fail('direction required');
 const direction=withAlbumColour(parsed,songs,result.song_id);
 if(!Number.isSafeInteger(input.baseRevision)||input.baseRevision<0)throw fail('baseRevision must be the latest revision you edited (0 for the first)');
 const projection=atlasVisualScore(result,{...input,direction,useSaved:false});
 if(!projection.validation.ok)throw fail(`composed score is invalid: ${projection.validation.errors.map(e=>e.code).join(', ')}`);
 const note=typeof input.note==='string'?input.note.slice(0,500):'';
 const author=typeof input.author==='string'&&input.author.trim()?input.author.trim().slice(0,80):'operator';
 return store.append(result.song_id,{baseRevision:input.baseRevision,author,note,runId:result.run_id,
  timelineFingerprint:projection.timeline.fingerprint,scoreFingerprint:projection.score.fingerprint,
  validation:{ok:true,warnings:projection.validation.warnings.length},direction});
}

/**
 * Append-only ledger of named looks shared by every Song. The latest row per
 * name wins; a deletion is a tombstone row, so earlier looks stay recoverable.
 */
export function createVisualScoreLookStore({dir,lock,release}){
 const file=path.join(dir,'looks.ndjson');
 function rows(){
  if(!fs.existsSync(file))return {rows:[],ignoredLines:0};
  let ignoredLines=0;const out=[];
  for(const line of fs.readFileSync(file,'utf8').split('\n')){
   if(!line.trim())continue;
   try{const row=JSON.parse(line);if(row.schemaVersion===DUST_LOOK_SCHEMA&&dustLookSlug(row.name))out.push(row);else ignoredLines++;}catch{ignoredLines++;}
  }
  return {rows:out,ignoredLines};
 }
 function list(){
  const {rows:all,ignoredLines}=rows(),latest=new Map();
  for(const row of all)latest.set(row.slug,row);
  const saved=[...latest.values()].filter(row=>!row.deleted&&validateDustLook(row).ok);
  return {looks:mergeDustLooks(saved),saved:saved.length,revisions:all.length,ignoredLines};
 }
 function save(input={}){
  const deleted=input.deleted===true||input.deleted==='true';
  const name=typeof input.name==='string'?input.name.trim():'';
  const look=deleted?{}:parseValue(input.look,'look');
  const check=validateDustLook({name,look});
  if(!check.ok)throw fail(`invalid look: ${check.errors.map(e=>e.message).join(' ')}`);
  const slug=dustLookSlug(name),lease=lock();
  try{
   const current=rows().rows.filter(row=>row.slug===slug),revision=(current.at(-1)?.revision||0)+1;
   if(deleted&&(!current.length||current.at(-1).deleted))throw fail(`No saved look named ${name}`,404);
   const row={schemaVersion:DUST_LOOK_SCHEMA,slug,name,revision,author:typeof input.author==='string'&&input.author.trim()?input.author.trim().slice(0,80):'operator',
    note:typeof input.note==='string'?input.note.slice(0,500):'',...(deleted?{deleted:true}:{look}),createdAt:new Date().toISOString()};
   fs.mkdirSync(dir,{recursive:true});
   const fd=fs.openSync(file,'a',0o600);
   try{fs.writeSync(fd,`${JSON.stringify(row)}\n`);fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
   return row;
  }finally{release(lease);}
 }
 return {list,save};
}
