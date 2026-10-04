import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createCharacterMemoryClient} from '../server/writer-characters.mjs';

// Opt-in integration proof: one finite child at a time, temporary fixture DB,
// no native store, network, workers, models, or inherited Python preload.
const owner=process.env.HAPA_WRITER_CHARACTER_TEST_OWNER;
const dependencies=process.env.HAPA_WRITER_CHARACTER_TEST_DEPENDENCIES || (owner ? path.dirname(owner) : '');
test('finite Python owner round-trip preserves large text, history, restore and checkpoint refs',{skip:!owner,timeout:30000},async()=>{
 assert.ok(path.isAbsolute(owner)&&path.isAbsolute(dependencies));
 const dir=await mkdtemp(path.join(tmpdir(),'writer-character-owner-test-'));
 let client,small;
 try{
  const wrapper=path.join(dir,'fixture_owner.py'),grant=path.join(dir,'grant.json'),db=path.join(dir,'fixture.db');
  // Python literals are generated JSON strings, not shell interpolation.
  await writeFile(wrapper,`import sys, sqlite3, runpy\nfrom pathlib import Path\nsys.path.insert(0, ${JSON.stringify(dependencies)})\nstore=${JSON.stringify(db)}\nif not Path(store).exists():\n con=sqlite3.connect(store)\n con.execute('CREATE TABLE agent_notes(note_id,target_type,target_id,agent_name,note_type,body_md,confidence,provenance_json,created_at)')\n con.commit()\n con.close()\nsys.argv.extend(['--db',store])\nrunpy.run_path(${JSON.stringify(owner)},run_name='__main__')\n`);
  await writeFile(grant,JSON.stringify({contract:'hapa.character-access/v2',epoch:'test-only',owner:'hapa-avatar-builder',avatarIds:['fixture-avatar'],actorIds:['api-client'],projectIds:['fixture-project'],permissions:{read:true,save:true,provision:false,checkpointRead:true,checkpointSave:true}}),{mode:0o600});
  const config={python:'/usr/bin/python3',script:wrapper,accessFile:grant,timeoutMs:10000};client=createCharacterMemoryClient(config);
  const key={owner:'hapa-avatar-builder',avatarId:'fixture-avatar',scope:{projectId:'global',branchId:null,sceneId:null}};
  const long='🌍 verse\n'.repeat(12000),layers={canon:long,memory:'',development:'',lore:''};
  const audit={actor:{actorId:'api-client',instanceId:'instance:fixture:owner-transport'},sources:[{owner:'test-fixture',id:'test-corpus',revision:'unversioned'}],provenance:{changeType:'edit',reason:'Fixture round-trip beyond former16KiB limit'}};
  const first=(await client('save',{...key,...audit,operationId:'fixture-save-1',expectedRevision:0,expectedDigest:null,layers},{apply:true})).character;assert.equal(first.layers.canon,long);assert.equal(first.revision,1);
  const second=(await client('save',{...key,...audit,operationId:'fixture-save-2',expectedRevision:1,expectedDigest:first.digest,layers:{...layers,canon:'Revised'}},{apply:true})).character;
  const old=await client('read',{...key,revision:1});assert.equal(old.character.layers.canon,long);assert.equal(old.currentHead.revision,2);
  const history=await client('history',{...key,limit:1});assert.equal(history.history.length,1);assert.equal(history.history[0].layers,undefined);assert.equal(history.nextBeforeRevision,2);
  const restored=(await client('save',{...key,...audit,operationId:'fixture-restore',expectedRevision:2,expectedDigest:second.digest,layers,provenance:{changeType:'restore',reason:'Restore exact prior fixture',restoreFrom:{revision:1,digest:first.digest}}},{apply:true})).character;assert.equal(restored.revision,3);assert.equal(restored.layers.canon,long);
  small=createCharacterMemoryClient({...config,outputLimitBytes:1024});
  await assert.rejects(()=>small('save',{...key,...audit,operationId:'fixture-output-refusal',expectedRevision:3,expectedDigest:restored.digest,layers},{apply:true}),error=>error.code==='output_transport_limit');
  assert.equal((await client('read',key)).character.revision,3);
  const cpKey={owner:'hapa-writers-room',projectId:'fixture-project',branchId:null};
  const checkpoint=await client('checkpoint-save',{...cpKey,...audit,operationId:'fixture-checkpoint',expectedRevision:0,expectedDigest:null,snapshotJson:'{\n "fixture": true\n}',characterRefs:[{...key,revision:restored.revision,digest:restored.digest}],songRefs:[],provenance:{changeType:'checkpoint',reason:'Pin fixture character revision'}},{apply:true});
  assert.equal(checkpoint.checkpoint.snapshotJson,'{\n "fixture": true\n}');assert.equal(checkpoint.checkpoint.characterRefs[0].digest,restored.digest);
  const verified=await client('verify',{...key,limit:100});assert.equal(verified.history.length,3);assert.equal(verified.status,'verified_page');
 }finally{await client?.close();await small?.close();await rm(dir,{recursive:true,force:true});}
});
