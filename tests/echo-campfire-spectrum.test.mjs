import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {readCampfireSpectrum} from '../server/echo-campfire-spectrum.mjs';import {handleAudioAtlas} from '../server/audio-atlas-routes.mjs';
test('Campfire spectrum is master-bound and read only',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'echo-campfire-spectrum-')),sha='a'.repeat(64),other='b'.repeat(64),result={assets:[{id:'master',source_sha256:sha}]},dir=path.join(root,'data/campfire-spectra');
 try{assert.throws(()=>readCampfireSpectrum(root,result),/No prepared/);fs.mkdirSync(dir,{recursive:true});const file=path.join(dir,sha+'.json'),value={schema:'echo-fire.master-spectrum.v1',masterSha256:sha,hopSeconds:.05,frames:[Array(32).fill(.5)]};fs.writeFileSync(file,JSON.stringify(value));assert.deepEqual(readCampfireSpectrum(root,result),value);value.masterSha256=other;fs.writeFileSync(file,JSON.stringify(value));assert.throws(()=>readCampfireSpectrum(root,result),/invalid|different master/);value.masterSha256=sha;value.frames[0][1]=2;fs.writeFileSync(file,JSON.stringify(value));assert.throws(()=>readCampfireSpectrum(root,result),/invalid/);assert.throws(()=>readCampfireSpectrum(root,{assets:[{id:'master',source_sha256:'../../x'}]}),/identity/);}finally{fs.rmSync(root,{recursive:true,force:true});}
});
test('Campfire spectrum endpoint requires same-origin authorization and only permits reads',async()=>{
 let calls=0,response;const url=new URL('http://127.0.0.1/api/echos/audio-atlas/jobs/run-1/campfire-spectrum');const base={res:{},url,atlas:{campfireSpectrum:id=>{calls++;return {id};}},sendJson:(_r,status,body)=>response={status,body}};
 await handleAudioAtlas({...base,req:{method:'GET',headers:{origin:'http://evil',host:'127.0.0.1'}},requireAdmin:()=>true});assert.equal(response.status,403);assert.equal(calls,0);
 await handleAudioAtlas({...base,req:{method:'GET',headers:{}},requireAdmin:()=>false});assert.equal(calls,0);
 await handleAudioAtlas({...base,req:{method:'POST',headers:{}},requireAdmin:()=>true});assert.equal(response.status,405);assert.equal(calls,0);
 await handleAudioAtlas({...base,req:{method:'GET',headers:{}},requireAdmin:()=>true});assert.equal(response.status,200);assert.deepEqual(response.body.spectrum,{id:'run-1'});assert.equal(calls,1);
});
