#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import {prepareEchoImage} from '../server/echo-image-preparation.mjs';
import {buildProtectedCameraPath} from '../src/domain/media-role-camera.js';
import {createImageShotGeometry} from '../src/domain/unified-media-catalog.js';
const ROOT=path.resolve(import.meta.dirname,'..');
const option=name=>process.argv.find(arg=>arg.startsWith(`--${name}=`))?.slice(name.length+3);
const manifestPath=option('manifest'),outputPath=option('output');
if(!manifestPath||!outputPath)throw new Error('--manifest=<source-bound image records> and --output=<new report> are required');
const manifest=JSON.parse(await fs.readFile(manifestPath,'utf8'));
if(!Array.isArray(manifest.assets)||!manifest.assets.length||manifest.assets.length>100)throw new Error('Prepare 1–100 explicit image records per run');
const results=[];
for(const asset of manifest.assets){
  const geometry=createImageShotGeometry(asset.geometry);
  const camera=buildProtectedCameraPath({mediaId:asset.mediaId,sourceHash:geometry.original.sha256,
    technical:geometry.original,durationSeconds:8,readingSeconds:geometry.readingSeconds,
    analysis:{sourceHash:geometry.protectionEvidence?.sourceHash,protectedRegionsStatus:geometry.protectionStatus,
      protectedRegions:geometry.protectedRegions.map(row=>row.rect)}});
  const prepared=await prepareEchoImage({sourcePath:asset.sourcePath,geometry,
    outputRoot:path.join(ROOT,'data/media/echo-image-preview'),uriRoot:'/media/echo-image-preview',
    outputProfile:{width:960,height:540},cameraCrops:camera.keyframes.map(row=>row.crop),fit:camera.corridors[0].startCrop.fit});
  results.push({mediaId:asset.mediaId,sourcePath:asset.sourcePath,cacheKey:prepared.cacheKey,selection:prepared.selection,
    mediaContract:{type:'image',originalUri:geometry.original.uri,runtimeUri:geometry.original.uri,
      dimensions:{width:geometry.original.width,height:geometry.original.height},sourceHash:geometry.original.sha256,
      imageShot:geometry,imageRenditions:prepared.renditions},camera});
}
await fs.mkdir(path.dirname(path.resolve(outputPath)),{recursive:true});
await fs.writeFile(outputPath,JSON.stringify({schemaVersion:'hapa.echo.prepared-image-shots.v1',sourceManifest:path.resolve(manifestPath),assets:results},null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({prepared:results.length,output:path.resolve(outputPath),cacheKeys:results.map(row=>row.cacheKey)}));
