import fs from 'node:fs/promises';
import path from 'node:path';
import {deriveEchoDirectionVariantProject,echoDirectionVariantId} from '../src/domain/echo-direction-variants.js';
const segment=(value,kind)=>{const input=String(value||'').trim(),pattern=kind==='variant'?/^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/:/^[A-Za-z0-9][A-Za-z0-9._-]{0,199}$/;if(!pattern.test(input)||path.basename(input)!==input)throw Error('Invalid '+kind+' identifier.');return input;};
async function read(file){if((await fs.stat(file)).size>32*1024**2)throw Error('media_source_project_too_large');return JSON.parse(await fs.readFile(file,'utf8'));}
export function echoSavedVariantRows(payload){
 if(Array.isArray(payload))return payload;if(!payload||typeof payload!=='object')return [];
 if(Array.isArray(payload.direction_script_variants))return payload.direction_script_variants;
 const candidate=payload.direction_script_variant||payload.music_video_project_variant||payload.variant||payload;
 return candidate&&typeof candidate==='object'?[candidate]:[];
}
/** Shared read-only saved-cut lookup for the protected API and local export.
 * Exact file preference and legacy wrapper handling preserve the existing owner. */
export async function readEchoSavedVariant({root,variantsRoot=path.join(root,'data/music-video-project-variants'),songId,variantId,warn=()=>{}}){
 const song=segment(songId,'song'),id=segment(variantId,'variant'),directory=path.join(variantsRoot,song);
 let entries;try{entries=await fs.readdir(directory,{withFileTypes:true});}catch(error){if(error.code!=='ENOENT')warn(error);return null;}
 const candidates=entries.filter(e=>e.isFile()&&e.name.endsWith('.json')).sort((a,b)=>(path.basename(a.name,'.json')===id?0:1)-(path.basename(b.name,'.json')===id?0:1)||a.name.localeCompare(b.name));
 for(const entry of candidates){
  const file=path.join(directory,entry.name),fallback=path.basename(entry.name,'.json');
  try{for(const [index,row]of echoSavedVariantRows(await read(file)).entries()){
   const selected=echoDirectionVariantId(row)||`${fallback}${index?'-'+(index+1):''}`;
   if(selected===id)return {...row,id:selected,variant_source:{kind:'append-only-project-variant',path:path.relative(root,file),nonDestructive:true}};
  }}catch(error){warn(error);}
 }
 return null;
}
export async function readEchoSavedCut({root,dataDir=path.join(root,'data'),variantsRoot=path.join(dataDir,'music-video-project-variants'),songId,cutId}){
 const song=segment(songId,'song'),cut=cutId==='legacy'?'legacy':segment(cutId,'variant');
 const payload=await read(path.join(dataDir,'music-video-projects',song+'-video-project.json')),project=payload.music_video_project||payload;
 if(project.song_id!==song)throw Error('Saved project song differs from requested identity.');
 const variant=cut==='legacy'?null:await readEchoSavedVariant({root,variantsRoot,songId:song,variantId:cut})||project.direction_script_variants?.find(row=>echoDirectionVariantId(row)===cut);
 if(cut!=='legacy'&&!variant)return null;
 return {...(variant?deriveEchoDirectionVariantProject(project,variant):project),active_direction_script_variant:{id:cut}};
}
