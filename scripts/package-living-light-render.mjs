#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import {createLivingLightService} from '../server/living-light-service.mjs';
import {readEchoSavedCut} from '../server/echo-saved-cut-reader.mjs';
import {packageLivingLightRender,createLivingLightMediaPackager} from '../server/living-light-render-package.mjs';
const root=path.resolve(import.meta.dirname,'..'),arg=name=>process.argv.find(v=>v.startsWith('--'+name+'='))?.slice(name.length+3);
const songId=arg('song-id'),cutId=arg('cut-id'),output=arg('output');
if(!songId||!cutId||!output)throw Error('Use --song-id=<exact song> --cut-id=<saved cut> --output=<new local package directory> [--prepared-source=<owner input JSON>].');
const target=path.resolve(output);await fs.mkdir(target,{recursive:false});
const resolveCut=(songId,cutId)=>readEchoSavedCut({root,variantsRoot:process.env.HAPA_ECHO_DIRECTION_VARIANTS_DIR||path.join(root,'data/music-video-project-variants'),songId,cutId});
const owner=createLivingLightService({root,storePath:process.env.HAPA_LIVING_LIGHT_AUTHORING_STORE,resolveCut});
try{
 const project=await resolveCut(songId,cutId);if(!project)throw Error('The exact saved cut is unavailable.');
 let preparedSource=null;const sourcePath=arg('prepared-source');if(sourcePath){if((await fs.stat(sourcePath)).size>64*1024**2)throw Error('Prepared source input exceeds 64 MiB');preparedSource=JSON.parse(await fs.readFile(sourcePath,'utf8'));}
 const snapshot=await packageLivingLightRender({project,owner,preparedSource,signal:AbortSignal.timeout(120000),packageMedia:createLivingLightMediaPackager({root,projectPath:path.join(root,'data/music-video-projects',songId+'-video-project.json'),output:target,signal:AbortSignal.timeout(120000)})});
 if(!snapshot)throw Error('This saved cut has no Living Light cues.');
 const file=path.join(target,'living-light-render.json');await fs.writeFile(file,JSON.stringify(snapshot,null,2)+'\n',{flag:'wx'});
 console.log(JSON.stringify({ok:true,songId,cutId,snapshotDigest:snapshot.snapshotDigest,recipes:snapshot.recipes.length,paintedSources:snapshot.recipes.reduce((n,row)=>n+row.sources.length,0),manifest:file,storeMutation:false,analysisExecuted:false,finalEncoding:'awaiting-encoder-integration'},null,2));
}finally{owner.close();}
