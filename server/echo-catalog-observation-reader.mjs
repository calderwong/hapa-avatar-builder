import {readFile,stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {readEchoObservationRows,observationDatabaseStamp} from './echo-catalog-observation-rows.mjs';
import {resolveEchoRuntimeMediaUri} from './echo-runtime-media-route.mjs';
const stamp=async file=>stat(file).then(row=>[row.size,row.mtimeMs,row.ctimeMs,row.ino].join(':')).catch(error=>{if(error.code==='ENOENT')return null;throw error});
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');

/** Disposable prepared snapshot. On a catalog change, revalidate only bounded
 * requested rows; never extract, hash source files or invoke models. The owner
 * must match each returned sourceStamp against
 * its existing current-availability check before exposing observations. */
export function createEchoObservationReader({indexPath,catalogPath,root,mediaDir,maxBytes=16*1024*1024}) {
 if(!Number.isFinite(maxBytes)||maxBytes<=0||maxBytes>64*1024*1024)throw Error('observation-reader-byte-budget');
 let cache,flight;
 const key=uri=>{const route=resolveEchoRuntimeMediaUri(uri,{root,mediaDir});return route.ok?route.resolvedPath:null};
 async function load(){
  try{
   const info=await stat(indexPath);if(info.size>maxBytes)throw Error('observation-index-budget');
   const version=[info.size,info.mtimeMs,info.ctimeMs,info.ino].join(':');
   if(cache?.version!==version){
    const bytes=await readFile(indexPath);if(bytes.length>maxBytes)throw Error('observation-index-budget');
    if(await stamp(indexPath)!==version)throw Error('observation-index-changed');
    const value=JSON.parse(bytes),{schemaVersion,observationSchema,catalog,requested,sources,observations,missing}=value;
    if(schemaVersion!=='hapa.echo.catalog-observation-snapshot.v1'||observationSchema!=='hapa.echo.catalog-observation.v1'||catalog?.path!==catalogPath||typeof catalog.rowRevision!=='string'||!/^[a-f0-9]{64}$/.test(catalog.rowRevision)||!Array.isArray(catalog.stamp)||catalog.stamp.length!==2||!Array.isArray(sources)||sources.length>4096||!Array.isArray(observations)||observations.length>6144||!Array.isArray(requested)||requested.length>2048||!Array.isArray(missing)||missing.length>2048||hash({schemaVersion,observationSchema,catalog,requested,sources,observations,missing})!==value.revision)throw Error('observation-index-schema-or-revision');
    const byMedia=new Map(),byPath=new Map();
    for(const observation of observations){const list=byMedia.get(observation.mediaId)||[];list.push(observation);byMedia.set(observation.mediaId,list);}
    for(const source of sources){
     const bindings=byPath.get(source.path)||[];
     if(bindings.some(row=>row.mediaId===source.mediaId))throw Error('observation-source-identity-ambiguous');
     bindings.push({mediaId:source.mediaId,sourceStamp:source.stamp,sourceSha256:source.expectedSha256,sourceDurationSeconds:source.sourceDurationSeconds,sourceByteStatus:source.status==='bytes-verified'&&source.expectedSha256===source.actualSha256?'bytes-verified':'unverified',observations:byMedia.get(source.mediaId)||[]});byPath.set(source.path,bindings);
    }
    cache={version,revision:value.revision,catalog,requested,byPath,validatedStamp:catalog.stamp};
   }
   if(JSON.stringify(await observationDatabaseStamp(catalogPath))!==JSON.stringify(cache.validatedStamp)){
    const current=await readEchoObservationRows({catalogPath,mediaIds:cache.requested,maxOutputBytes:maxBytes});
    if(current.rowRevision!==cache.catalog.rowRevision)return {status:'stale',reason:'catalog-source-changed',revision:cache.revision};
    cache.validatedStamp=current.stamp;
   }
   const snapshot=cache;
   return {status:'ready',revision:snapshot.revision,lookup(uri,mediaId){const records=snapshot.byPath.get(key(uri))||[];const matches=mediaId?records.filter(row=>row.mediaId===mediaId):records;return matches.length===1?matches[0]:null}};
  }catch(error){cache=undefined;return {status:'unavailable',reason:error.code||error.message};}
 }
 return {get(){return flight ||= load().finally(()=>{flight=undefined})}};
}

export function hydrateEchoObservedContent(shot,record,reader,availability) {
 const ready=reader.status==='ready'&&record?.mediaId===shot.media_id&&record?.sourceByteStatus==='bytes-verified'&&record.sourceStamp&&record.sourceStamp===availability?.stamp;
 const contract=shot.media_contract||shot.mediaContract||{};
 const runtimeUri=shot.runtime_media_uri||contract.runtimeUri||shot.media_uri||contract.originalUri||null;
 const contentEvidence={schemaVersion:'hapa.echo.prepared-content-evidence.v1',status:ready?'prepared-inferred-limited':'unavailable',
  revision:reader.revision||null,reason:ready?null:reader.reason||(!record?'source-not-indexed':'source-bytes-changed-or-unverified'),
  boundRuntimeUri:ready?runtimeUri:null,boundMediaId:ready?shot.media_id:null,
  sourceSha256:ready?record.sourceSha256:null,sourceDurationSeconds:ready?record.sourceDurationSeconds:null,observations:ready?record.observations:[],semanticTruth:ready?'inferred-unreviewed':'unmeasured',continuousCoverage:false};
 return {...shot,contentEvidence,media_contract:{...(shot.media_contract||shot.mediaContract||{}),contentEvidence}};
}
