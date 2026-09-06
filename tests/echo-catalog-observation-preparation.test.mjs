import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {prepareEchoCatalogObservations as prepare} from '../server/echo-catalog-observation-preparation.mjs';
import {createEchoSourceInspector} from '../server/echo-source-inventory.mjs';
import {createEchoMediaEvidenceReader} from '../server/echo-media-evidence-index.mjs';
import {prepareEchoTimelineMediaEvidence,rebindEchoMediaEvidenceAfterMetadata} from '../server/echo-media-eligibility.mjs';
import {applyEchoMediaEvidenceProjection} from '../src/domain/unified-media-catalog.js';
import {echoDirectionVariantFingerprint,deriveEchoDirectionVariantProject} from '../src/domain/echo-direction-variants.js';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
async function fixture(t){
 const dir=await mkdtemp(path.join(os.tmpdir(),'echo-observation-fixture-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const source=path.join(dir,'source.mp4'),catalogPath=path.join(dir,'catalog.sqlite3');await writeFile(source,'exact source bytes for identity testing only');
 const db=new DatabaseSync(catalogPath);const fingerprint=JSON.stringify({ahash:'a',dhash:'b',phash:'c',lumaMean:.2,lumaStd:.1});
 db.exec('CREATE TABLE videos(media_id TEXT PRIMARY KEY,sha256 TEXT,canonical_path TEXT,duration_sec REAL,updated_at TEXT); CREATE TABLE frames(frame_id TEXT PRIMARY KEY,media_id TEXT,marker TEXT,at_seconds REAL,updated_at TEXT,fingerprint_json TEXT); CREATE TABLE recognition(frame_id TEXT PRIMARY KEY,media_id TEXT,marker TEXT,status TEXT,provider TEXT,recognized_at TEXT,fingerprint_json TEXT,labels_json TEXT,text_lines_json TEXT)');
 db.prepare('INSERT INTO videos VALUES(?,?,?,?,?)').run('m',hash(await readFile(source)),source,10,'2026-01-01');
 db.prepare('INSERT INTO frames VALUES(?,?,?,?,?,?)').run('f','m','mid',5,'2026-01-01',fingerprint);
 db.prepare('INSERT INTO recognition VALUES(?,?,?,?,?,?,?,?,?)').run('f','m','mid','ready','fixture-provider','2026-01-02',fingerprint,'[{"identifier":"fire","confidence":0.4}]','[]');db.close();
 return {source,catalogPath,sourceInspector:createEchoSourceInspector(),mediaIds:['m']};
}

test('read-only catalog projection reuses actual source inspector and deduplicates requested sources',async t=>{
 const options=await fixture(t),before=await readFile(options.catalogPath),sourceBefore=await readFile(options.source);
 const first=await prepare({...options,mediaIds:['m','missing','m']});
 assert.equal(first.metrics.available,1);assert.equal(first.sources.length,1);assert.deepEqual(first.requested,['m','missing']);
 assert.equal(first.observations[0].labels[0].text,'fire');assert.equal(first.missing[0].reason,'source-not-in-catalog');
 const second=await prepare({...options,mediaIds:['missing','m']});assert.equal(first.revision,second.revision);assert.ok(options.sourceInspector.metrics().cacheHits>0);
 assert.equal(first.analysisCalls,0);assert.equal(first.modelCalls,0);
 assert.deepEqual(await readFile(options.catalogPath),before);assert.deepEqual(await readFile(options.source),sourceBefore);
});

test('changed current bytes make old recognition unavailable without changing catalog',async t=>{
 const options=await fixture(t);await writeFile(options.source,'changed source');
 const result=await prepare(options);assert.equal(result.metrics.available,0);assert.equal(result.observations[0].reason,'source-content-unverified-or-changed');
});

test('concurrent catalog or source replacement invalidates a preparation',async t=>{
 const options=await fixture(t),real=options.sourceInspector;
 await assert.rejects(()=>prepare({...options,sourceInspector:{inspect:async file=>{const inspected=await real.inspect(file);await writeFile(file,'replaced');return inspected}}}),/media-changed-during-preparation/);
 const next=await fixture(t);
 await assert.rejects(()=>prepare({...next,sourceInspector:{inspect:async file=>{const inspected=await next.sourceInspector.inspect(file);const db=new DatabaseSync(next.catalogPath);db.exec("UPDATE videos SET updated_at='2026-02-01'");db.close();return inspected}}}),/catalog-changed-during-preparation/);
});

test('bounded preparation fails explicitly before publishing oversized data',async t=>{
 const options=await fixture(t);
 await assert.rejects(()=>prepare({...options,mediaIds:Array(2049).fill('m')}),/media-budget/);
 await assert.rejects(()=>prepare({...options,maxOutputBytes:20}),/input-byte-budget/);
});

import {createEchoObservationReader,hydrateEchoObservedContent} from '../server/echo-catalog-observation-reader.mjs';

test('prepared observation reader is single-flight, byte-bounded and binds hydration to current source stamp',async t=>{
 const options=await fixture(t),snapshot=await prepare(options),indexPath=path.join(path.dirname(options.catalogPath),'index.json');
 await writeFile(indexPath,JSON.stringify(snapshot));
 const reader=createEchoObservationReader({...options,indexPath,root:path.dirname(indexPath)});
 const [one,two]=await Promise.all([reader.get(),reader.get()]);assert.equal(one,two);assert.equal(one.status,'ready');
 const record=one.lookup(options.source);assert.equal(record.observations.length,1);
 const shot={media_id:'m',media_uri:options.source,start_sec:0,end_sec:3},before=JSON.stringify(shot);
 const hydrated=hydrateEchoObservedContent(shot,record,one,{stamp:snapshot.sources[0].stamp});assert.equal(hydrated.contentEvidence.status,'prepared-inferred-limited');assert.deepEqual(hydrated.media_contract.contentEvidence,hydrated.contentEvidence);
 assert.equal(JSON.stringify(shot),before);
 assert.deepEqual(hydrateEchoObservedContent(shot,record,one,{stamp:'new'}).contentEvidence.observations,[]);
 assert.equal(hydrateEchoObservedContent(shot,null,one,{}).contentEvidence.reason,'source-not-indexed');
 const small=createEchoObservationReader({...options,indexPath,maxBytes:1});assert.equal((await small.get()).reason,'observation-index-budget');
});

test('catalog changes and tampered snapshots cannot reuse old observation evidence',async t=>{
 const options=await fixture(t),snapshot=await prepare(options),indexPath=path.join(path.dirname(options.catalogPath),'index.json');
 await writeFile(indexPath,JSON.stringify(snapshot));const reader=createEchoObservationReader({...options,indexPath});
 assert.equal((await reader.get()).status,'ready');
 const db=new DatabaseSync(options.catalogPath);db.exec("UPDATE recognition SET provider='changed'");db.close();
 assert.equal((await reader.get()).status,'stale');
 const fresh=await prepare(options);fresh.observations[0].labels[0].text='tampered';await writeFile(indexPath,JSON.stringify(fresh));
 assert.equal((await reader.get()).reason,'observation-index-schema-or-revision');
});

test('unrelated catalog writes preserve prepared evidence but changed requested rows invalidate it',async t=>{
 const options=await fixture(t);
 const updateUnrelated=()=>{const db=new DatabaseSync(options.catalogPath);try{db.prepare('INSERT OR REPLACE INTO videos VALUES(?,?,?,?,?)').run('unrelated','x','/missing',1,new Date().toISOString());}finally{db.close();}};
 const snapshot=await prepare({...options,sourceInspector:{inspect:async file=>{const result=await options.sourceInspector.inspect(file);updateUnrelated();return result;}}});
 assert.equal(snapshot.metrics.available,1);
 const indexPath=path.join(path.dirname(options.catalogPath),'index.json');await writeFile(indexPath,JSON.stringify(snapshot));
 const reader=createEchoObservationReader({...options,indexPath});assert.equal((await reader.get()).status,'ready');
 updateUnrelated();const current=await reader.get();assert.equal(current.status,'ready');assert.equal(current.revision,snapshot.revision);
 const db=new DatabaseSync(options.catalogPath);try{db.exec("UPDATE frames SET at_seconds=6 WHERE media_id='m'");}finally{db.close();}
 assert.equal((await reader.get()).status,'stale');
});

test('runtime copies require exact current bytes before borrowing catalog observations',async t=>{
 const options=await fixture(t),dir=path.dirname(options.source),copy=path.join(dir,'copy.mp4'),changed=path.join(dir,'changed.mp4');
 await writeFile(copy,await readFile(options.source));await writeFile(changed,'different runtime bytes');
 const snapshot=await prepare({...options,runtimeSources:[{mediaId:'m',path:copy},{mediaId:'m',path:changed}]});
 assert.equal(snapshot.sources.find(row=>row.path===copy).binding,'verified-exact-byte-copy');
 assert.equal(snapshot.sources.find(row=>row.path===changed).binding,'runtime-bytes-do-not-match-catalog-source');
 const indexPath=path.join(dir,'runtime-index.json');await writeFile(indexPath,JSON.stringify(snapshot));
 const reader=await createEchoObservationReader({...options,indexPath}).get();assert.equal(reader.status,'ready');
 const copied=reader.lookup(copy),different=reader.lookup(changed);
 assert.equal(hydrateEchoObservedContent({media_id:"m",media_uri:copy},copied,reader,{stamp:copied.sourceStamp}).contentEvidence.observations.length,1);
 assert.equal(hydrateEchoObservedContent({media_id:"m",media_uri:changed},different,reader,{stamp:different.sourceStamp}).contentEvidence.observations.length,0);
 assert.equal(hydrateEchoObservedContent({media_id:"m",media_uri:copy},copied,reader,{stamp:'changed-after-preparation'}).contentEvidence.observations.length,0);
 await assert.rejects(()=>prepare({...options,runtimeSources:[{mediaId:'unknown',path:copy}]}),/runtime-source-budget-or-schema/);
});

test('one runtime path with different media identities never mixes their source observations',async t=>{
 const options=await fixture(t),dir=path.dirname(options.source),other=path.join(dir,'other.mp4'),runtime=path.join(dir,'runtime.mp4');
 await writeFile(other,'another original');await writeFile(runtime,await readFile(options.source));
 const db=new DatabaseSync(options.catalogPath);try{db.prepare('INSERT INTO videos VALUES(?,?,?,?,?)').run('n',hash(await readFile(other)),other,10,'2026-01-01');}finally{db.close();}
 const snapshot=await prepare({...options,mediaIds:['m','n'],runtimeSources:[{mediaId:'m',path:runtime},{mediaId:'n',path:runtime}]});
 const indexPath=path.join(dir,'identities.json');await writeFile(indexPath,JSON.stringify(snapshot));
 const reader=await createEchoObservationReader({...options,indexPath}).get();assert.equal(reader.status,'ready');
 assert.equal(reader.lookup(runtime),null);
 assert.equal(reader.lookup(runtime,'m').sourceByteStatus,'bytes-verified');
 assert.equal(reader.lookup(runtime,'n').sourceByteStatus,'unverified');
 assert.equal(reader.lookup(runtime,'invented'),null);
});

test('the existing evidence owner replaces submitted observations and projects only onto the exact cut',async t=>{
 const options=await fixture(t),root=path.dirname(options.source),indexPath=path.join(root,'observations.json');
 const snapshot=await prepare(options);await writeFile(indexPath,JSON.stringify(snapshot));
 const reader=createEchoMediaEvidenceReader({root,indexPath:path.join(root,'missing-declarations.json'),observationIndexPath:indexPath,observationCatalogPath:options.catalogPath});
 const forged={status:'prepared-inferred-limited',observations:[{labels:[{text:'invented'}]}]};
 const shot={media_id:'m',media_uri:options.source,start_sec:0,end_sec:3,contentEvidence:forged,media_contract:{contentEvidence:forged},camera_motion:'static'};
 const before=JSON.stringify(shot);
 const prepared=await prepareEchoTimelineMediaEvidence([shot],{root,mediaEvidenceReader:reader});
 assert.equal(prepared.canonicalEvidence.status,'unavailable');assert.equal(prepared.observedContent.status,'ready');
 assert.equal(prepared.timeline[0].contentEvidence.observations[0].labels[0].text,'fire');
 assert.deepEqual(prepared.timeline[0].media_contract.contentEvidence,prepared.timeline[0].contentEvidence);
 const sidecar={schemaVersion:'hapa.echo.media-evidence-projection.v1',sourceFingerprint:'exact',timeline:prepared.timeline};
 const projected=applyEchoMediaEvidenceProjection([shot],sidecar,'exact');assert.equal(projected[0].contentEvidence.observations[0].labels[0].text,'fire');
 assert.equal(projected[0].camera_motion,'static');assert.equal(projected[0].media_uri,shot.media_uri);
 assert.deepEqual(applyEchoMediaEvidenceProjection([shot],sidecar,'different'),[shot]);
 assert.equal(JSON.stringify(shot),before);
 await writeFile(options.source,'new runtime bytes');
 const changed=await prepareEchoTimelineMediaEvidence([shot],{root,mediaEvidenceReader:reader});assert.deepEqual(changed.timeline[0].contentEvidence.observations,[]);
 const absent=await prepareEchoTimelineMediaEvidence([shot],{root});assert.deepEqual(absent.timeline[0].contentEvidence.observations,[]);
 const generated=await prepareEchoTimelineMediaEvidence([{...shot,media_id:'none'}],{root,mediaEvidenceReader:reader});assert.deepEqual(generated.timeline[0].contentEvidence.observations,[]);
});

test('post-preparation metadata keeps valid sidecars bound without blessing changed cuts',()=>{
 const shot={media_id:'m',media_uri:'/media/source.mp4',start_sec:0,end_sec:3};
 const variant={id:'cut',timeline:[shot]},fingerprint=echoDirectionVariantFingerprint(variant);
 variant.canonical_media_evidence={schemaVersion:'hapa.echo.media-evidence-projection.v1',sourceFingerprint:fingerprint,timeline:[{...shot,contentEvidence:{status:'prepared-inferred-limited'}}]};
 const before={song_id:'song',duration:3,direction_script_variants:[variant]};
 const enrich=(change={})=>({...before,direction_script_variants:[{...variant,timeline:[{...shot,human_enrichment:{qualityGrade:4},...change}]}]});
 const result=rebindEchoMediaEvidenceAfterMetadata(before,enrich()),delivered=result.direction_script_variants[0];
 assert.equal(delivered.canonical_media_evidence.sourceFingerprint,echoDirectionVariantFingerprint(delivered));
 assert.notEqual(delivered.canonical_media_evidence.sourceFingerprint,fingerprint);
 const projected=deriveEchoDirectionVariantProject(result,delivered);assert.equal(projected.timeline[0].contentEvidence.status,'prepared-inferred-limited');assert.equal(projected.timeline[0].human_enrichment.qualityGrade,4);
 for(const change of [{media_uri:'/media/different.mp4'},{media_id:'other'},{end_sec:2}]){
  const changed=rebindEchoMediaEvidenceAfterMetadata(before,enrich(change)).direction_script_variants[0];
  assert.equal(changed.canonical_media_evidence.sourceFingerprint,fingerprint);
 }
 const stale=structuredClone(before);stale.direction_script_variants[0].canonical_media_evidence.sourceFingerprint='stale';
 const staleResult=rebindEchoMediaEvidenceAfterMetadata(stale,enrich());assert.equal(staleResult.direction_script_variants[0].canonical_media_evidence.sourceFingerprint,fingerprint);
 assert.equal(variant.canonical_media_evidence.sourceFingerprint,fingerprint);assert.equal(shot.human_enrichment,undefined);
});
