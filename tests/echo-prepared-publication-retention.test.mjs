import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import path from 'node:path';import os from 'node:os';
import {publishEchoPerformance} from '../server/echo-prepared-performance-store.mjs';
test('publication pressure evicts superseded entries but preserves live legacy and coherent pointers',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'ll-retained-publications-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const hash='a'.repeat(64),base={schemaVersion:'hapa.echo.music-performance.v1',sourcePolicy:'living-light-assets-v1',songId:'song',masterAudioHash:hash,buses:[{id:'master',audioHash:hash}]},checks=[{role:'master',sha256:hash}];
 const publish=bundle=>publishEchoPerformance({root,bundle,sourceChecks:checks,maxPublishedEntries:2});
 const legacy=await publish(base),coherent=await publish({...base,stemSelectionPolicy:'coherent-stems-v1'});
 const newer=await publish({...base,stemSelectionPolicy:'coherent-stems-v1',visualTiming:{test:'new-revision'}});
 const exists=key=>fs.stat(path.join(root,'published',key+'.json')).then(()=>true,()=>false);
 assert(await exists(legacy.key));assert(await exists(newer.key));assert.equal(await exists(coherent.key),false);
 const before=await fs.readdir(path.join(root,'published'));
 await assert.rejects(publish({...base,songId:'third-live-source'}),{code:'echo_performance_pinned_budget_exceeded'});
 assert.deepEqual(await fs.readdir(path.join(root,'published')),before);assert(await exists(legacy.key));assert(await exists(newer.key));
});
