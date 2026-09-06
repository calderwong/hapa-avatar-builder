import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

function harness(){
 const source=fs.readFileSync('scripts/compile-hyperframes-show-v2.mjs','utf8');
 const body=source.slice(source.indexOf('async function prepareMediaAt(t){'),source.indexOf('\nwindow.HAPA_PREPARE_MEDIA_AT='));
 const listeners=new Map();
 const image={tagName:'IMG',id:'source-image',dataset:{instanceIndex:'0'},complete:false,naturalWidth:0,getAttribute:()=>'/media/image.png',addEventListener:(event,fn)=>listeners.set(event,fn),removeEventListener:event=>listeners.delete(event)};
 const prepare=vm.runInNewContext(body+';prepareMediaAt',{media:[image],S:{instances:{media:[{source:{compiledUri:'image.png'}}]}},mediaReadyForShader:el=>el.complete&&el.naturalWidth>0,hyperFramesMediaPresentationWindow:()=>({presentationStart:0,presentationEnd:8}),setTimeout,clearTimeout,window:{},document:{}});
 return {image,listeners,prepare};
}
test('HyperFrames preparation waits for the actual image pixels and releases listeners',async()=>{
 const {image,listeners,prepare}=harness();let done=false;
 const promise=prepare(1).then(()=>{done=true;});await Promise.resolve();assert.equal(done,false);
 assert.equal(listeners.size,2);image.complete=true;image.naturalWidth=1024;listeners.get('load')();await promise;
 assert.equal(done,true);assert.equal(listeners.size,0);
});
test('failed image decode blocks rendering and cleans readiness listeners',async()=>{
 const {image,listeners,prepare}=harness();const promise=prepare(1);
 image.complete=true;listeners.get('error')();await assert.rejects(promise,/Failed preparing image/);assert.equal(listeners.size,0);
 await assert.rejects(prepare(1),/Failed preparing image/);assert.equal(listeners.size,0);
});
