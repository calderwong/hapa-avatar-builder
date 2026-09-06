import {readFile,stat} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {declaredMediaIdentities} from '../src/domain/unified-media-catalog.js';
import {hasExcludedEchoDirectorOrigin} from '../src/domain/echo-media-source-policy.js';
import {resolveEchoRuntimeMediaUri} from './echo-runtime-media-route.mjs';

export const ECHO_MEDIA_EVIDENCE_SCHEMA='hapa.echo.canonical-media-evidence.v1';
export const ECHO_MEDIA_EVIDENCE_SOURCES=[['avatar','avatar-store.json','avatars','assets'],['scene','scene-store.json','scenes','assets'],['item','item-manager-store.json','cards','mediaAssets'],['library','media-library.json','records',null]];
export const echoEvidenceStamp=info=>[info.size,info.mtimeMs,info.ctimeMs,info.ino].join(':');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const key=(uri,paths)=>{const route=resolveEchoRuntimeMediaUri(uri,paths);return route.ok?route.resolvedPath:null};

/** Preparation only: one bounded source parse at a time. No playback or HTTP
 * request should rebuild this index. Source hashes bind declarations to stores,
 * not to decoded visual identity or newly measured media bytes. */
export async function buildEchoMediaEvidenceIndex({root,sourcePaths={},maxSourceBytes=512*1024*1024,maxRecords=100000}={}) {
  const sources=[],records=[],avatarIds=new Set(),sceneIds=new Set();
  for(const [kind,file,collection,assetField] of ECHO_MEDIA_EVIDENCE_SOURCES){
    const sourcePath=path.resolve(sourcePaths[kind]||path.join(root,'data',file));
    const before=await stat(sourcePath);
    if(before.size>maxSourceBytes)throw new Error('echo_evidence_source_budget');
    const bytes=await readFile(sourcePath);
    if(bytes.length>maxSourceBytes)throw new Error('echo_evidence_source_budget');
    const sourceHash=hash(bytes),store=JSON.parse(bytes.toString('utf8'));
    if(!Array.isArray(store[collection]))throw new Error('echo_evidence_source_schema');
    sources.push({kind,path:sourcePath,stamp:echoEvidenceStamp(before),sha256:sourceHash});
    for(const parent of store[collection]){
      if(kind==='avatar')avatarIds.add(parent.id);
      if(kind==='scene')sceneIds.add(parent.id);
      const assets=assetField?parent[assetField]||[]:[{...parent.asset,id:parent.asset?.id||parent.id,uri:parent.uri||parent.asset?.uri}];
      for(const asset of assets){
        if(!asset.uri||typeof asset.uri!=='string')continue;
        if(records.length>=maxRecords)throw new Error('echo_evidence_record_budget');
        const fields={characterIds:asset.characterIds,sceneIds:asset.sceneIds,cast:asset.cast,avatarId:asset.avatarId,metadata:{avatarIds:asset.metadata?.avatarIds,sceneId:asset.metadata?.sceneId}};
        records.push({uri:asset.uri,aliases:[asset.id,...(kind==='library'?[parent.id]:[])].filter(Boolean),source:`data/${file}#${collection}/${parent.id}/${assetField||'asset'}/${asset.id||''}`,sourceRevision:sourceHash,fields,
          sourceAllowed:!hasExcludedEchoDirectorOrigin(asset,asset.metadata,parent)&&asset.sourceAllowed!==false&&asset.sourcePolicy?.allowed!==false&&asset.autoEligible!==false&&parent.sourceAllowed!==false&&parent.sourcePolicy?.allowed!==false,
          owner:{kind,id:parent.id},declaredContentHash:asset.metadata?.echosTechnicalAffordance?.contentHash?.value||null});
      }
    }
    if(echoEvidenceStamp(await stat(sourcePath))!==echoEvidenceStamp(before))throw new Error('echo_evidence_source_changed');
  }
  for(const record of records){const identities=declaredMediaIdentities(record.fields,{avatarIds,sceneIds,source:record.source,sourceRevision:record.sourceRevision});delete record.fields;Object.assign(record,identities);}
  const paths={root},mediaStamps=new Map();
  for(const row of records){const resolved=key(row.uri,paths);if(resolved&&!mediaStamps.has(resolved))mediaStamps.set(resolved,await stat(resolved).then(echoEvidenceStamp).catch(()=>null));row.mediaStamp=mediaStamps.get(resolved)||null;
    if(/^[a-f0-9]{64}$/.test(row.declaredContentHash||''))row.aliases.push('hapa-media:sha256:'+row.declaredContentHash);}
  for(const source of sources)if(echoEvidenceStamp(await stat(source.path))!==source.stamp)throw new Error('echo_evidence_source_changed');
  return {schemaVersion:ECHO_MEDIA_EVIDENCE_SCHEMA,revision:hash(JSON.stringify(sources)),createdAt:new Date().toISOString(),sources,records,truth:'canonical-declarations-not-visual-verification',readOnly:true};
}

/** Small disposable projection; stat every owning source before using it.
 * A changed store requires explicit preparation; no expensive surprise rebuild.
 * The same promise serves concurrent reads, with a strict retained-byte cap. */
export function createEchoMediaEvidenceReader({indexPath,root,mediaDir,sourcePaths={},maxIndexBytes=32*1024*1024,maxRecords=100000}={}) {
  let cached,flight;
  const paths={root,mediaDir};
  async function load(){
    try{
      const info=await stat(indexPath),stamp=echoEvidenceStamp(info);
      if(info.size>maxIndexBytes)throw new Error('index-budget-exceeded');
      if(!cached||cached.stamp!==stamp){
        const bytes=await readFile(indexPath);if(bytes.length>maxIndexBytes)throw new Error('index-budget-exceeded');
        const index=JSON.parse(bytes.toString('utf8'));
        if(index.schemaVersion!==ECHO_MEDIA_EVIDENCE_SCHEMA||!Array.isArray(index.records)||index.records.length>maxRecords||index.sources?.length!==4||hash(JSON.stringify(index.sources))!==index.revision)throw new Error('invalid-index');
        const byPath=new Map();
        for(const row of index.records){const resolved=key(row.uri,paths);if(!resolved)continue;const rows=byPath.get(resolved)||[];rows.push(row);byPath.set(resolved,rows);}
        cached={stamp,index,byPath};
      }
      for(const [kind,file] of ECHO_MEDIA_EVIDENCE_SOURCES){
        const source=cached.index.sources.find(row=>row.kind===kind);
        const expected=path.resolve(sourcePaths[kind]||path.join(root,'data',file));
        if(source?.path!==expected||echoEvidenceStamp(await stat(expected))!==source.stamp)return {status:'stale',reason:'canonical-source-changed',revision:cached.index.revision};
      }
      const snapshot=cached;
      return {status:'ready',revision:snapshot.index.revision,lookup(uri){return snapshot.byPath.get(key(uri,paths))||[]}};
    }catch(error){cached=undefined;return {status:'unavailable',reason:error.code||error.message};}
  }
  return {get(){return flight ||= load().finally(()=>{flight=undefined})}};
}

export function hydrateEchoMediaEvidence(timeline,index){
  return timeline.map(shot=>{
    if(shot.media_id==='none'||shot.knockedOut)return shot;
    const contract=shot.media_contract||shot.mediaContract||{};
    const runtime=shot.runtime_media_uri||contract.runtimeUri||shot.media_uri||contract.originalUri||'';
    const original=shot.media_uri||contract.originalUri||runtime;
    const rows=index.status==='ready'?index.lookup(runtime):[];
    // Original declarations may restrict policy but cannot label an unrelated
    // runtime derivative. Derivative lineage must be prepared separately.
    const originalRows=index.status==='ready'?index.lookup(original):[];
    const all=[...new Set([...rows,...originalRows])];
    const unique=values=>[...new Set(values)].sort();
    const evidence={status:index.status==='ready'?(rows.length?'canonical-declarations':'unindexed-source'):index.status,revision:index.revision||null,reason:index.reason||null,visualVerified:false,
      mediaStamps:unique(rows.map(row=>row.mediaStamp).filter(Boolean)),declarations:rows.flatMap(row=>row.evidence),rejected:rows.flatMap(row=>row.rejected)};
    const fields={characterIds:unique(rows.flatMap(row=>row.characterIds)),sceneIds:unique(rows.flatMap(row=>row.sceneIds)),cast:null,
      canonicalMediaIds:unique(all.flatMap(row=>row.aliases)),identityEvidence:evidence,
      sourceAllowed:shot.sourceAllowed!==false&&contract.sourceAllowed!==false&&all.every(row=>row.sourceAllowed)};
    return {...shot,...fields,media_contract:{...contract,...fields}};
  });
}
