import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const status=value=>({ready:'todo',in_review:'review'}[value]||value);

// The configured Overwatch module owns event interpretation. This adapter only
// reads exact snapshots and compares explicitly mapped requirements; it never
// writes events or treats a status match as implementation acceptance.
export function createEchoKanbanMirrorReader({configPath,io=fs,loadOwner=url=>import(url)}={}){
 let lastConfirmedAt=null;
 async function bounded(file,limit){const stat=await io.stat(file);if(stat.size>limit)throw new Error('Board mirror source exceeds its read budget');const bytes=await io.readFile(file);if(bytes.length>limit)throw new Error('Board mirror source grew beyond its read budget');return bytes;}
 return async board=>{
  const checkedAt=new Date().toISOString();
  let config;
  try{config=JSON.parse(await bounded(configPath,128*1024));}
  catch(error){if(error.code==='ENOENT')return {status:'not-configured',checkedAt,lastConfirmedAt};throw error;}
  if(config.schemaVersion!=='hapa.echo.kanban-mirror.v1'||!path.isAbsolute(config.ownerModule||'')||!/^[-a-zA-Z0-9_]+$/.test(config.projectId||'')||!Array.isArray(config.taskIds)||!config.taskIds.length||config.taskIds.length>500||new Set(config.taskIds).size!==config.taskIds.length||config.taskIds.some(id=>typeof id!=='string'||id.length>160))throw new Error('Invalid local Overwatch mirror configuration');
  const owner=await loadOwner(pathToFileURL(config.ownerModule).href);
  if(!path.isAbsolute(owner.ROOT_DIR||'')||typeof owner.deriveState!=='function')throw new Error('Overwatch owner does not expose its read-only event projection');
  const [configBytes,eventBytes]=await Promise.all([bounded(path.join(owner.ROOT_DIR,'config/projects',config.projectId+'.json'),1024*1024),bounded(path.join(owner.ROOT_DIR,'data',config.projectId,'events.ndjson'),32*1024*1024)]);
  const projectConfig=JSON.parse(configBytes);
  const events=eventBytes.toString('utf8').split('\n').filter(Boolean).map((line,index)=>({...JSON.parse(line),sequence:index+1}));
  const projected=owner.deriveState(projectConfig,events);
  const remote=new Map(projected.tasks.map(task=>[task.id,task]));
  const local=new Map((board.lanes||[]).flatMap(lane=>lane.cards||[]).map(card=>[card.id,card]));
  const differences=[];let matched=0;
  for(const id of config.taskIds){const here=local.get(id),there=remote.get(id);if(!here||!there){differences.push({cardId:id,localStatus:here?.status||null,overwatchStatus:there?.column||null,reason:!here?'missing-in-echo':'missing-in-overwatch'});continue;}if(status(here.status)!==status(there.column))differences.push({cardId:id,localStatus:here.status,overwatchStatus:there.column,reason:'status-differs'});else matched++;}
  if(!differences.length)lastConfirmedAt=checkedAt;
  return {status:differences.length?'different':'aligned',scope:'configured-requirement-statuses',checkedAt,lastConfirmedAt,projectId:config.projectId,sourceRevision:hash(Buffer.concat([configBytes,eventBytes])),lastEventAt:events.at(-1)?.ts||null,matched,total:config.taskIds.length,differences};
 };
}
