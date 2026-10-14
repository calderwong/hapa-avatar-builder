import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {prepareEchoPlaybackProxy} from '../server/echo-playback-proxy.mjs';
import {runEchoPreparationStage} from '../server/echo-performance-preparation.mjs';
import {packagePreparedVideo} from '../scripts/lib/hyperframes-prepared-video.mjs';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
async function command(exe,args){let out='';await runEchoPreparationStage(exe,args,{timeoutMs:30000,onOutput:s=>{out+=s;}});return out;}
async function fixture(t,{vfr=false,fractional=false}={}){
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'echo-lossless-export-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const source=path.join(root,'source.mp4');
 await command('ffmpeg',['-v','error','-nostdin','-f','lavfi','-i','testsrc2=s=1440x32:r=24:d=1',
 '-vf',fractional?'settb=1/12288,setpts=PTS+N,setsar=4/3':vfr?"select='not(mod(n,3))+not(mod(n,5))',setsar=4/3":'setsar=4/3','-fps_mode','passthrough',...(fractional?['-enc_time_base','1:12288']:[]),'-c:v','libx264','-threads','2','-pix_fmt','yuv420p','-color_range','tv','-colorspace','bt709','-color_trc','bt709','-color_primaries','bt709', ...(vfr?['-output_ts_offset','1']:[]),source]);
 return {root,source,options:{sourcePath:source,proxyRoot:path.join(root,'cache'),purpose:'prepared-export-lossless-v1'}};
}
test('lossless export retains full dimensions,24fps pixels, color, SAR, source bytes and independent packets; cache is verified',async t=>{
 const f=await fixture(t),original=await fs.readFile(f.source),result=await prepareEchoPlaybackProxy(f.options);
 assert.equal(result.width,1440);assert.equal(result.height,32);assert.equal(result.frameRate,'24/1');
 assert.equal(result.losslessVerification.frameCount,24);assert.equal(result.sourceFrameDigest,result.losslessVerification.frameDigest);
 assert.equal(result.settings.sourceMetadata.sampleAspectRatio,'4:3');assert.equal(result.settings.sourceMetadata.colorSpace,'bt709');
 assert.equal(result.sourceHash,hash(original));assert.notEqual(result.sha256,result.sourceHash);assert.match(result.path,/export.mp4$/);
 const packets=JSON.parse(await command('ffprobe',['-v','error','-select_streams','v:0','-show_packets','-show_entries','packet=flags,pts_time,dts_time','-of','json',result.path])).packets;
 assert.equal(packets.length,24);assert(packets.every(p=>p.flags.includes('K')&&p.pts_time===p.dts_time));
 assert.equal((await prepareEchoPlaybackProxy(f.options)).cached,true);
 await fs.writeFile(result.path,'corrupted derivative');const healed=await prepareEchoPlaybackProxy(f.options);assert.equal(healed.cached,false);assert.equal(healed.sha256,result.sha256);
 assert.deepEqual(await fs.readFile(f.source),original);assert(!(await fs.readdir(f.options.proxyRoot)).some(n=>n.startsWith('.preparing-')));
});
test('positive source origin and variable presentation intervals retain exact decoded sequence; compiler lineage separates source and derivative',async t=>{
 const f=await fixture(t,{vfr:true}),original=await fs.readFile(f.source),result=await prepareEchoPlaybackProxy(f.options);
 assert.equal(result.startSeconds,1);assert.equal(result.losslessVerification.firstUs,1e6);assert(result.losslessVerification.frameCount<24);
 const contract={type:'video',contentHash:hash(original),originalUri:'/media/original.mp4',assetName:'original.mp4'},before=structuredClone(contract);
 const packaged=await packagePreparedVideo({source:f.source,contract,output:path.join(f.root,'package'),cacheRoot:f.options.proxyRoot});
 assert.deepEqual(contract,before);assert.equal(packaged.compiledDerivation.originalSha256,'sha256:'+hash(original));assert.equal(packaged.compiledSha256,'sha256:'+hash(await fs.readFile(path.join(f.root,'package',packaged.compiledUri))));
 assert.equal(packaged.compiledDerivation.verification.frameDigest,result.losslessVerification.frameDigest);
 await assert.rejects(packagePreparedVideo({source:f.source,contract:{...contract,contentHash:'a'.repeat(64)},output:path.join(f.root,'bad'),cacheRoot:f.options.proxyRoot}),/content hash changed/);
 await assert.rejects(fs.stat(path.join(f.root,'bad')),{code:'ENOENT'});
});
test('lossless profile refuses trimming, unknown mode and canceled work; previews retain their separate fidelity',async t=>{
 const f=await fixture(t),controller=new AbortController();controller.abort();
 await assert.rejects(prepareEchoPlaybackProxy({...f.options,signal:controller.signal}));
 await assert.rejects(fs.stat(f.options.proxyRoot),{code:'ENOENT'});
 await assert.rejects(prepareEchoPlaybackProxy({...f.options,maximumDurationSeconds:.5}),/trimming-forbidden/);
 await assert.rejects(prepareEchoPlaybackProxy({...f.options,purpose:'guess'}),/purpose-unsupported/);
 const preview=await prepareEchoPlaybackProxy({...f.options,purpose:'preview'});
 assert.equal(preview.width,1280);assert.equal(preview.settings.crf,27);assert.equal(preview.losslessVerification,undefined);assert.match(preview.fidelity,/preview/);
});

test('rotated source explicitly refuses lossless export instead of changing its presentation',async t=>{
 const f=await fixture(t),rotated=path.join(f.root,'rotated.mp4');
 await command('ffmpeg',['-v','error','-nostdin','-display_rotation','90','-i',f.source,'-map','0:v:0','-c','copy',rotated]);
 await assert.rejects(prepareEchoPlaybackProxy({...f.options,sourcePath:rotated}),/format-unsupported/);
 await assert.rejects(fs.stat(f.options.proxyRoot),{code:'ENOENT'});
});

test('cancel during lossless preparation releases its stage and removes partial derivatives',async t=>{
 const f=await fixture(t),before=await fs.readFile(f.source),controller=new AbortController();let timer;
 const seen=new Promise((resolve,reject)=>{const started=Date.now();timer=setInterval(async()=>{
   try {if((await fs.readdir(f.options.proxyRoot)).some(name=>name.startsWith('.preparing-'))){clearInterval(timer);controller.abort();resolve();}}
   catch(error){if(error.code!=='ENOENT'){clearInterval(timer);reject(error);}}
   if(Date.now()-started>3000){clearInterval(timer);controller.abort();reject(Error('Preparation did not reach owned partial output'));}
 },5);});
 t.after(()=>clearInterval(timer));
 const stopped=assert.rejects(prepareEchoPlaybackProxy({...f.options,signal:controller.signal}),/cancelled|aborted/i);
 await Promise.all([stopped,seen]);
 assert.deepEqual(await fs.readFile(f.source),before);assert.deepEqual(await fs.readdir(f.options.proxyRoot),[]);
});

test('source timestamp precision survives a non-integral nominal frame cadence',async t=>{
 const f=await fixture(t,{fractional:true}),result=await prepareEchoPlaybackProxy(f.options);
 assert.equal(result.losslessVerification.frameCount,24);assert(result.losslessVerification.lastUs>958333);
 assert.equal(result.sourceFrameDigest,result.losslessVerification.frameDigest);
});
