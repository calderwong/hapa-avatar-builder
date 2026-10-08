import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';

const paths=['data/item-manager-store.json','data/scene-store.json','data/media-library.json','data/music-video-project-variants/index.json'];
const snapshot=()=>paths.map(file=>[file,crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')]);
const run=args=>spawnSync(process.execPath,['scripts/ingest-scroll-site-media.mjs',...args],{encoding:'utf8',timeout:30000,maxBuffer:1024*1024,shell:false,env:{...process.env,NODE_OPTIONS:''}});

test('Scroll library-only recovery verifies source Cards and hashes, replays idempotently, and writes nothing in dry run',()=>{
 const before=snapshot(), result=run(['--missing-only','--library-only']);
 assert.equal(result.status,0,result.stderr);assert.ifError(result.error);
 const report=JSON.parse(result.stdout);
 assert.equal(report.scope,'existing-scroll-card-library-projection-only');assert.equal(report.mode,'dry-run');
 assert.equal(report.sourceCardsVerified,159);assert.equal(report.addedRecords,0);
 assert.equal(report.preservedExistingRecords,JSON.parse(fs.readFileSync(paths[2],'utf8')).records.length);
 for(const field of ['cardsWritten','scenesWritten','mediaFilesWritten','variantsWritten'])assert.equal(report[field],0);
 assert.equal(report.backupDirectory,'');assert.deepEqual(snapshot(),before);
});

test('Scroll library recovery refuses ambiguous write modes before touching stores',()=>{
 const before=snapshot();
 for(const args of [['--library-only','--apply'],['--missing-only','--library-only','--variants-only','--apply']]){
  const result=run(args);assert.equal(result.status,1);assert.ifError(result.error);assert.match(result.stderr,/Library recovery requires/);
 }
 assert.deepEqual(snapshot(),before);
});
