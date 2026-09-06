import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFile as execFileCallback} from 'node:child_process';
import {promisify} from 'node:util';
import {prepareEchoImage,verifyImageShotOriginal} from '../server/echo-image-preparation.mjs';
const execFile=promisify(execFileCallback);

test('prepared image derivatives verify source pixels, cache exact crop/profile/settings, and reject corruption',async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'echo-image-prepare-'));
  try{
    const sourcePath=path.join(root,'original.png');
    await execFile('ffmpeg',['-hide_banner','-loglevel','error','-f','lavfi','-i','testsrc2=size=1024x2048','-frames:v','1','-threads','1',sourcePath],{timeout:30000});
    const originalBytes=await fs.readFile(sourcePath),sourceHash=crypto.createHash('sha256').update(originalBytes).digest('hex');
    const geometry={original:{uri:'/media/original.png',sha256:sourceHash,width:1024,height:2048},pageId:'page-1',readingOrder:0};
    const options={sourcePath,geometry,outputRoot:path.join(root,'cache'),uriRoot:'/media/image-preview',outputProfile:{width:512,height:512},levels:[512,1024]};
    const [first,shared]=await Promise.all([prepareEchoImage(options),prepareEchoImage(options)]);
    assert.equal(first.cacheKey,shared.cacheKey);
    assert.equal(first.renditions.length,2);
    assert.equal(first.selection.selected.width,256);assert.equal(first.selection.selected.height,512);
    assert.equal(first.selection.selected.decodedBytes,256*512*4);
    const repeated=await prepareEchoImage(options);assert.equal(repeated.cached,true);
    const cropped=await prepareEchoImage({...options,cameraCrops:[{x:0,y:.25,width:1,height:.5}]});
    assert.notEqual(cropped.cacheKey,first.cacheKey);assert.equal(cropped.selection.selected.height,1024);
    const portrait=await prepareEchoImage({...options,outputProfile:{width:512,height:1024}});
    assert.notEqual(portrait.cacheKey,first.cacheKey);
    assert.deepEqual(await fs.readFile(sourcePath),originalBytes);
    await assert.rejects(()=>verifyImageShotOriginal(sourcePath,{...geometry,original:{...geometry.original,sha256:'a'.repeat(64)}}),/hash-mismatch/);
    await assert.rejects(()=>verifyImageShotOriginal(sourcePath,{...geometry,original:{...geometry.original,width:2048}}),/dimensions-mismatch/);
    const derivative=path.join(options.outputRoot,first.cacheKey,first.renditions[0].fileName);
    await fs.writeFile(derivative,'corrupt');
    await assert.rejects(()=>prepareEchoImage(options),/pixel-hash-mismatch/);
    assert.equal(await fs.readFile(derivative,'utf8'),'corrupt','failed cache is preserved for diagnosis');
  }finally{await fs.rm(root,{recursive:true,force:true});}
});
