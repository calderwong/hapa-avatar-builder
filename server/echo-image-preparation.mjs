import crypto from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { runEchoPreparationStage } from './echo-performance-preparation.mjs';
import { createImageShotGeometry, selectImageShotRendition } from '../src/domain/unified-media-catalog.js';

async function execFile(command,args,{timeout=30000,maxBuffer=1024*1024}={}) {
  const controller=new AbortController();
  let stdout='',overflow=false;
  await runEchoPreparationStage(command,args,{timeoutMs:timeout,signal:controller.signal,onOutput:chunk=>{
    if (stdout.length+chunk.length>maxBuffer) { overflow=true;controller.abort();return; }
    stdout+=chunk;
  }}).catch(error=>{if(overflow)throw new Error('image-preparation-output-budget-exceeded');throw error;});
  return {stdout};
}
const SCHEMA = 'hapa.echo.prepared-image.v1';
const pending = new Map();
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
async function hashFile(file) {
  const digest = crypto.createHash('sha256');
  for await (const chunk of fs.createReadStream(file)) digest.update(chunk);
  return digest.digest('hex');
}
async function probe(file) {
  const { stdout } = await execFile('ffprobe', ['-v','error','-select_streams','v:0','-show_entries','stream=width,height','-of','json',file], { timeout: 30000, maxBuffer: 1024*1024 });
  const stream = JSON.parse(stdout).streams?.[0];
  if (![stream?.width,stream?.height].every(n=>Number.isSafeInteger(n)&&n>0)) throw new Error('image-probe-dimensions-unavailable');
  return { width:stream.width,height:stream.height };
}
export async function verifyImageShotOriginal(sourcePath, input) {
  const geometry = createImageShotGeometry(input);
  const source = await fsp.realpath(sourcePath);
  const stat = await fsp.stat(source);
  if (!stat.isFile() || stat.size>512*1024*1024) throw new Error('image-original-file-budget-exceeded');
  const hash = await hashFile(source);
  if (hash!==geometry.original.sha256) throw new Error('image-original-hash-mismatch');
  const dimensions = await probe(source);
  if (dimensions.width!==geometry.original.width || dimensions.height!==geometry.original.height) throw new Error('image-original-dimensions-mismatch');
  // Check after the probe as well, so metadata is never published for changed bytes.
  if (await hashFile(source)!==hash) throw new Error('image-original-changed-during-verification');
  return { sourcePath:source,sha256:hash,...dimensions,bytes:stat.size };
}

export function prepareEchoImage(options) {
  const key = JSON.stringify(options);
  if (pending.has(key)) return pending.get(key);
  const task = prepare(options).finally(()=>pending.delete(key));
  pending.set(key,task);
  return task;
}
async function prepare({ sourcePath, geometry: input, outputRoot, uriRoot, outputProfile,
  cameraCrops=[{x:0,y:0,width:1,height:1}], fit='contain', levels=[512,1024,2048],
  maxTextureSize=8192,maxDecodedBytes=64*1024*1024 }={}) {
  const geometry = createImageShotGeometry(input);
  if (!Array.isArray(cameraCrops)||!cameraCrops.length||cameraCrops.length>256||cameraCrops.some(c=>![c.x,c.y,c.width,c.height].every(Number.isFinite)||c.x<0||c.y<0||c.width<=0||c.height<=0||c.x+c.width>1+1e-9||c.y+c.height>1+1e-9)) throw new Error('invalid-image-camera-path');
  if (!Array.isArray(levels)||!levels.length||levels.length>8||levels.some(n=>!Number.isSafeInteger(n)||n<64||n>8192)) throw new Error('invalid-image-derivative-levels');
  if (typeof uriRoot!=='string'||!uriRoot.startsWith('/media/')||uriRoot.includes('..')) throw new Error('image-cache-media-uri-required');
  const narrowest={width:Math.min(...cameraCrops.map(c=>c.width)),height:Math.min(...cameraCrops.map(c=>c.height))};
  selectImageShotRendition({geometry,outputProfile,crop:narrowest,fit,maxTextureSize,maxDecodedBytes});
  const original=await verifyImageShotOriginal(sourcePath,geometry);
  if (original.width*original.height*4>128*1024*1024 || Math.max(original.width,original.height)>16384) throw new Error("image-original-requires-tiled-preparation");
  const settings={format:'png',filter:'lanczos',levels:[...new Set(levels)].sort((a,b)=>a-b),maxTextureSize,maxDecodedBytes};
  const { stdout: decoderVersion }=await execFile('ffmpeg',['-version'],{timeout:10000,maxBuffer:1024*1024});
  const identity={schemaVersion:SCHEMA,sourceHash:original.sha256,uriRoot,outputProfile,cameraCrops,fit,settings,decoder:decoderVersion.split('\n')[0]};
  const cacheKey=sha(JSON.stringify(identity));
  const root=path.resolve(outputRoot),directory=path.join(root,cacheKey),manifestPath=path.join(directory,'manifest.json');
  await fsp.mkdir(root,{recursive:true});
  const realRoot=await fsp.realpath(root);
  if(original.sourcePath===realRoot||original.sourcePath.startsWith(realRoot+path.sep))throw new Error('image-cache-must-not-contain-original');
  try {
    const cached=JSON.parse(await fsp.readFile(manifestPath,'utf8'));
    if(cached.cacheKey!==cacheKey||JSON.stringify(cached.identity)!==JSON.stringify(identity))throw new Error('image-cache-identity-mismatch');
    for(const row of cached.renditions){
      if(row.sourceHash!==original.sha256||row.verified!==true||row.uri!==`${uriRoot.replace(/\/$/,'')}/${cacheKey}/${row.fileName}`||!/^[0-9]+x[0-9]+\.png$/.test(row.fileName))throw new Error('invalid-image-cache-filename');
      const file=path.join(directory,row.fileName);
      if(await hashFile(file)!==row.sha256)throw new Error('image-cache-pixel-hash-mismatch');
      const dims=await probe(file);
      if(dims.width!==row.width||dims.height!==row.height)throw new Error('image-cache-dimensions-mismatch');
    }
    return {...cached,cached:true};
  } catch(error) { if(error.code!=='ENOENT')throw error; }
  // A unique staging directory and exclusive publication leave any existing cache untouched.
  const temporary=await fsp.mkdtemp(path.join(root,'.preparing-'));
  try {
    const renditions=[];
    for(const edge of settings.levels){
      const scale=Math.min(1,edge/Math.max(original.width,original.height));
      const width=Math.max(1,Math.round(original.width*scale)),height=Math.max(1,Math.round(original.height*scale));
      if(width===original.width&&height===original.height)continue;
      if(width>maxTextureSize||height>maxTextureSize||width*height*4>maxDecodedBytes)continue;
      const fileName=`${width}x${height}.png`;
      if(renditions.some(row=>row.fileName===fileName))continue;
      const file=path.join(temporary,fileName);
      await execFile('ffmpeg',['-hide_banner','-loglevel','error','-nostdin','-i',original.sourcePath,'-frames:v','1','-vf',`scale=${width}:${height}:flags=lanczos`,'-threads','1',file],{timeout:60000,maxBuffer:1024*1024});
      const dimensions=await probe(file);
      if(dimensions.width!==width||dimensions.height!==height)throw new Error('image-derivative-dimensions-mismatch');
      renditions.push({fileName,uri:`${uriRoot.replace(/\/$/,'')}/${cacheKey}/${fileName}`,sha256:await hashFile(file),sourceHash:original.sha256,width,height,verified:true,decodedBytes:width*height*4});
    }
    if(await hashFile(original.sourcePath)!==original.sha256)throw new Error('image-original-changed-during-preparation');
    const selection=selectImageShotRendition({geometry,renditions,outputProfile,crop:narrowest,fit,maxTextureSize,maxDecodedBytes});
    const manifest={schemaVersion:SCHEMA,cacheKey,identity,geometry,renditions,selection,original,cached:false};
    await fsp.writeFile(path.join(temporary,'manifest.json'),JSON.stringify(manifest,null,2)+'\n',{flag:'wx'});
    await fsp.rename(temporary,directory);
    return manifest;
  } finally { await fsp.rm(temporary,{recursive:true,force:true}); }
}
