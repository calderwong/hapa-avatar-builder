import {echoDirectionVariantFingerprint,deriveEchoDirectionVariantProject} from '../src/domain/echo-direction-variants.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {declaredMediaIdentities,applyEchoMediaEvidenceProjection} from '../src/domain/unified-media-catalog.js';
import {buildEchoMediaEvidenceIndex,createEchoMediaEvidenceReader,hydrateEchoMediaEvidence} from '../server/echo-media-evidence-index.mjs';
import {validateEchoForkMedia} from '../server/echo-media-eligibility.mjs';

test('canonical ID declarations retain exact field provenance without promoting context or unknown IDs',()=>{
 const value=declaredMediaIdentities({title:'Red on the ship',avatarId:'a',metadata:{avatarIds:['a','unknown'],sceneId:'s',characters:['fake'],avatarTags:['fake']},relationships:[{ownerId:'fake'}]}, {avatarIds:new Set(['a']),sceneIds:new Set(['s']),source:'store#asset',sourceRevision:'rev'});
 assert.deepEqual(value.characterIds,['a']);assert.deepEqual(value.sceneIds,['s']);assert.equal(value.rejected.length,1);
 assert.ok(value.evidence.every(row=>row.visualVerified===false&&row.source==='store#asset'&&row.sourceRevision==='rev'));
 assert.deepEqual(declaredMediaIdentities({title:'a',owner:{id:'a'},metadata:{avatarTags:['a']}},{avatarIds:new Set(['a'])}).characterIds,[]);
});

async function fixture(){
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'echo-evidence-'));await fs.mkdir(path.join(root,'data/media'),{recursive:true});
 await fs.writeFile(path.join(root,'data/media/a.bin'),'local test source');
 await fs.writeFile(path.join(root,'data/media/b.bin'),'unrelated runtime');
 for(const [name,value] of [['avatar-store',{avatars:[{id:'a',assets:[]}]}],['scene-store',{scenes:[{id:'s',assets:[]}]}],['item-manager-store',{cards:[{id:'item',mediaAssets:[{id:'canonical',uri:'/media/a.bin',avatarId:'a',metadata:{sceneId:'s'}}]}]}],['media-library',{records:[]}]] )await fs.writeFile(path.join(root,'data',name+'.json'),JSON.stringify(value));
 const indexPath=path.join(root,'index.json');
 const index=await buildEchoMediaEvidenceIndex({root});await fs.writeFile(indexPath,JSON.stringify(index));
 return {root,indexPath,index,reader:createEchoMediaEvidenceReader({root,indexPath})};
}

test('save replaces submitted identities with current canonical evidence; aliases and source changes cannot bypass constraints',async()=>{
 const f=await fixture();try{
  const shot={media_id:'renamed',media_uri:'/media/a.bin',characterIds:['forged'],media_contract:{characterIds:['forged']}};
  const result=await validateEchoForkMedia([shot],{requiredCharacterIds:['a'],requiredSceneIds:['s']},{root:f.root,mediaEvidenceReader:f.reader});
  assert.deepEqual(result.preparedTimeline[0].characterIds,['a']);assert.equal(result.preparedTimeline[0].identityEvidence.visualVerified,false);assert.deepEqual(shot.characterIds,['forged']);
  await assert.rejects(validateEchoForkMedia([shot],{requiredCharacterIds:['forged']},{root:f.root,mediaEvidenceReader:f.reader}),/required-character/);
  await assert.rejects(validateEchoForkMedia([shot],{bans:['canonical'],pins:['renamed']},{root:f.root,mediaEvidenceReader:f.reader}),/operator-ban/);
  await assert.rejects(validateEchoForkMedia([{...shot,runtime_media_uri:'/media/b.bin'}],{requiredCharacterIds:['a']},{root:f.root,mediaEvidenceReader:f.reader}),/required-character/);
  await fs.appendFile(path.join(f.root,'data/media/a.bin'),'changed');
  await assert.rejects(validateEchoForkMedia([shot],{requiredCharacterIds:['a']},{root:f.root,mediaEvidenceReader:f.reader}),/required-character/);
  const staleBytes=await validateEchoForkMedia([shot],{},{root:f.root,mediaEvidenceReader:f.reader});assert.equal(staleBytes.preparedTimeline[0].identityEvidence.status,'source-bytes-changed-or-unverified');
 }finally{await fs.rm(f.root,{recursive:true,force:true})}
});

test('stale, absent and oversized indexes fail closed for identities; snapshots and source stores remain unchanged',async()=>{
 const f=await fixture();try{
  const [first,second]=await Promise.all([f.reader.get(),f.reader.get()]);assert.equal(first,second);assert.equal(first.status,'ready');
  const original=await fs.readFile(path.join(f.root,'data/item-manager-store.json'));
  await fs.appendFile(path.join(f.root,'data/scene-store.json'),' ');assert.equal((await f.reader.get()).status,'stale');
  const shot={media_id:'x',media_uri:'/media/a.bin',characterIds:['a']};
  await assert.rejects(validateEchoForkMedia([shot],{requiredCharacterIds:['a']},{root:f.root,mediaEvidenceReader:f.reader}),/required-character/);
  const unavailable=hydrateEchoMediaEvidence([shot],{status:'unavailable'});assert.deepEqual(unavailable[0].characterIds,[]);
  assert.equal((await createEchoMediaEvidenceReader({root:f.root,indexPath:f.indexPath,maxIndexBytes:1}).get()).status,'unavailable');
  assert.deepEqual(await fs.readFile(path.join(f.root,'data/item-manager-store.json')),original);
  assert.equal(first.lookup('/media/a.bin')[0].aliases[0],'canonical');
  await assert.rejects(buildEchoMediaEvidenceIndex({root:f.root,maxRecords:0}),/record_budget/);
 }finally{await fs.rm(f.root,{recursive:true,force:true})}
});


test('canonical source exclusion survives a forged origin and unrelated runtime; declaration options are not visually verified', async()=>{
 const f=await fixture();try{
  const file=path.join(f.root,'data/item-manager-store.json');const store=JSON.parse(await fs.readFile(file));store.cards[0].mediaAssets[0].origin={sourceSystem:'Hell Week'};await fs.writeFile(file,JSON.stringify(store));
  await fs.writeFile(f.indexPath,JSON.stringify(await buildEchoMediaEvidenceIndex({root:f.root})));
  const shot={media_id:'renamed',media_uri:'/media/a.bin',runtime_media_uri:'/media/b.bin',sourceAllowed:true,origin:{sourceSystem:'approved'},media_contract:{sourceAllowed:true}};
  await assert.rejects(validateEchoForkMedia([shot],{pins:['renamed']},{root:f.root,mediaEvidenceReader:f.reader}),/invalid-source-policy/);
 }finally{await fs.rm(f.root,{recursive:true,force:true})}
});


test('evidence sidecar preserves certified cut fingerprint and cannot replace media or timing',()=>{
 const timeline=[{media_id:'a',media_uri:'/media/a.bin',start_sec:0,end_sec:4}];
 const variant={id:'cut',timeline};variant.fingerprint=echoDirectionVariantFingerprint(variant);
 const base={song_id:'song',duration:4,director_show_graph:{schemaVersion:'hapa.music-viz.native-show-graph.v2',song:{id:'song',durationSeconds:4},tracks:[]}};
 variant.canonical_media_evidence={schemaVersion:'hapa.echo.media-evidence-projection.v1',sourceFingerprint:variant.fingerprint,timeline:[{...timeline[0],characterIds:['a'],sceneIds:['s'],media_title:'injected title',camera_motion:'injected motion'}]};
 assert.equal(echoDirectionVariantFingerprint(variant),variant.fingerprint);
 const result=deriveEchoDirectionVariantProject(base,variant);
 assert.deepEqual(result.timeline[0].characterIds,['a']);assert.equal(result.timeline[0].camera_motion,undefined);assert.equal(result.timeline[0].media_title,undefined);
 assert.equal(result.active_direction_script_variant.projectionValidation.ok,true);
 variant.canonical_media_evidence.timeline[0].media_uri='/media/b.bin';
 assert.deepEqual(applyEchoMediaEvidenceProjection(timeline,variant.canonical_media_evidence,variant.fingerprint),timeline);
 variant.canonical_media_evidence.timeline[0].media_uri='/media/a.bin';variant.canonical_media_evidence.sourceFingerprint='stale';
 assert.deepEqual(applyEchoMediaEvidenceProjection(timeline,variant.canonical_media_evidence,variant.fingerprint),timeline);
});
