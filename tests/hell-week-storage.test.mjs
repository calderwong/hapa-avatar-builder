import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
const { createHellWeekStorage, treeBytes } = createRequire(import.meta.url)('../electron/hell-week-storage.cjs');
async function setup(t, extra = {}) {
 const mount = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'hell-week-external-')));
 t.after(() => fs.rm(mount, {recursive:true,force:true}));
 const config = { mount, volumeUUID:'fixture', directory:'art', storeId:'fixture',maxBytes:100000,maxObjectBytes:1000,...extra };
 return {config, store:createHellWeekStorage({config,probeImpl:async()=>{}})};
}
test('external bytes deduplicate across calls and two restarts; corruption is rejected',async t=>{
 const {config,store}=await setup(t); const bytes=Buffer.from('unique retained pixels');
 await store.reserve('one'); const ref=await store.put(bytes,'one'); const before=await treeBytes(path.join(store.root,'objects'));
 for(let i=0;i<2;i++){const resumed=createHellWeekStorage({config,probeImpl:async()=>{}});await resumed.reserve('two');assert.deepEqual(await resumed.put(bytes,'two'),ref);assert.deepEqual(await resumed.read(ref),bytes);}
 assert.equal(await treeBytes(path.join(store.root,'objects')),before);
 await fs.writeFile(ref.path,'corrupt');await assert.rejects(store.read(ref),/digest mismatch/);
});
test('missing or wrong drive does not create directories; cap holds before admission',async t=>{
 const {config,store}=await setup(t); const held=createHellWeekStorage({config,probeImpl:async()=>{throw Error('wrong drive');}});
 await assert.rejects(held.reserve('one'),/wrong drive/); await assert.rejects(fs.stat(store.root),{code:'ENOENT'});
 await store.reserve('one'); await fs.writeFile(path.join(store.root,'retained.bin'),Buffer.alloc(config.maxBytes));
 await assert.rejects(store.reserve('two'),/ceiling/);
});
test('reservation and object byte bounds hold; path traversal and redirection reject',async t=>{
 const {store}=await setup(t);await store.reserve('one');
 await assert.rejects(store.put(Buffer.alloc(1001),'one'),/object limit/);
 await assert.rejects(store.put(Buffer.from('x'),'two'),/ownership/);
 const ref=await store.put(Buffer.from('x'),'one');
 await assert.rejects(store.read({...ref,relativePath:'../escape'}),/reference/);
});

test('a stalled external read holds without repeating the read or admitting generation',async t=>{
 const {config,store}=await setup(t); await store.reserve('before-stall');
 let reads=0, release;
 const held=createHellWeekStorage({config,probeImpl:async()=>{},readTimeoutMs:10,readFileImpl:()=>{reads++;return new Promise(resolve=>{release=resolve;});}});
 await assert.rejects(held.preflight(),/read timed out/);
 await assert.rejects(held.preflight(),/still unresponsive/);
 assert.equal(reads,1);
 release(await fs.readFile(path.join(store.root,'store.json'),'utf8'));
});


test('storage admission accounting includes allocated blocks and sparse logical commitments',async t=>{
 const {store}=await setup(t);await fs.mkdir(store.root,{recursive:true});const tiny=path.join(store.root,'tiny');await fs.writeFile(tiny,'x');const sparse=path.join(store.root,'sparse');const h=await fs.open(sparse,'w');await h.truncate(30000);await h.close();const stats=await Promise.all([tiny,sparse].map(f=>fs.stat(f)));assert.equal(await treeBytes(store.root),stats.reduce((n,s)=>n+Math.max(s.size,s.blocks*512),(await fs.stat(store.root)).blocks*512));assert.ok(await treeBytes(store.root)>=30001);
});
