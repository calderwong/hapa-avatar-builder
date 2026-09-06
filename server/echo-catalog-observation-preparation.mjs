import {readEchoObservationRows,observationFileStamp as stamp} from './echo-catalog-observation-rows.mjs';
import {createHash} from 'node:crypto';
import {projectEchoCatalogObservation,ECHO_CATALOG_OBSERVATION_SCHEMA} from './echo-catalog-observations.mjs';

const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
/** Bounded explicit preparation only. Reuse the catalog and source inspector;
 * never start extraction, recognition, downloads or request-time rebuilds. */
export async function prepareEchoCatalogObservations({catalogPath,mediaIds,runtimeSources=[],sourceInspector,maxOutputBytes=16*1024*1024}) {
 if(!Array.isArray(mediaIds)||mediaIds.length>2048||mediaIds.some(id=>typeof id!=='string'||!id||id.length>512))throw Error('observation-media-budget-or-schema');
 if(!sourceInspector?.inspect||!Number.isFinite(maxOutputBytes)||maxOutputBytes<1||maxOutputBytes>64*1024*1024)throw Error('observation-preparation-options');
 if(!Array.isArray(runtimeSources)||runtimeSources.length>2048||runtimeSources.some(row=>!mediaIds.includes(row.mediaId)||typeof row.path!=='string'||!row.path.startsWith('/')||row.path.length>4096))throw Error('observation-runtime-source-budget-or-schema');
 const initial=await readEchoObservationRows({catalogPath,mediaIds,maxOutputBytes});
 const {requested,records,loadedBytes}=initial;
 const observations=[],sources=[],missing=[];
 let outputBytes=0;
 for(const record of records){
  if(!record.video){missing.push(record);continue;}
  const {video}=record;
  if(typeof video.canonical_path!=='string'||!video.canonical_path.startsWith('/')||video.canonical_path.length>4096)throw Error('catalog-source-path-invalid');
  const beforeSource=await stamp(video.canonical_path),inspection=await sourceInspector.inspect(video.canonical_path);
  if(beforeSource!==await stamp(video.canonical_path))throw Error('media-changed-during-preparation');
  sources.push({mediaId:video.media_id,path:video.canonical_path,stamp:beforeSource,expectedSha256:video.sha256,sourceDurationSeconds:video.duration_sec,actualSha256:inspection.sha256||null,status:inspection.status});
  if(!record.frames.length)missing.push({mediaId:video.media_id,status:'unavailable',reason:'no-catalog-frames'});
  for(const {frame,recognition} of record.frames){
   const row=projectEchoCatalogObservation({video,frame,recognition,sourceInspection:inspection});
   outputBytes+=Buffer.byteLength(JSON.stringify(row));
   if(outputBytes>maxOutputBytes)throw Error('observation-output-byte-budget');
   observations.push(row);
  }
 }
 const catalogSources=new Map(sources.map(row=>[row.mediaId,row]));
 const knownBindings=new Set(sources.map(row=>row.path+'\0'+row.mediaId));
 for(const runtime of [...runtimeSources].sort((a,b)=>a.path.localeCompare(b.path)||a.mediaId.localeCompare(b.mediaId))){
  const bindingKey=runtime.path+'\0'+runtime.mediaId;
  if(knownBindings.has(bindingKey))continue;
  const original=catalogSources.get(runtime.mediaId);if(!original)continue;
  const beforeSource=await stamp(runtime.path),inspection=await sourceInspector.inspect(runtime.path);
  if(beforeSource!==await stamp(runtime.path))throw Error('media-changed-during-preparation');
  sources.push({mediaId:runtime.mediaId,path:runtime.path,stamp:beforeSource,expectedSha256:original.expectedSha256,
   sourceDurationSeconds:original.sourceDurationSeconds,actualSha256:inspection.sha256||null,status:inspection.status,
   binding:inspection.status==='bytes-verified'&&inspection.sha256===original.expectedSha256?'verified-exact-byte-copy':'runtime-bytes-do-not-match-catalog-source',catalogSourcePath:original.path});
  knownBindings.add(bindingKey);
 }
 for(const source of sources)if(source.stamp!==await stamp(source.path))throw Error('media-changed-during-preparation');
 const current=await readEchoObservationRows({catalogPath,mediaIds:requested,maxOutputBytes});
 if(current.rowRevision!==initial.rowRevision)throw Error('catalog-changed-during-preparation');
 const payload={schemaVersion:'hapa.echo.catalog-observation-snapshot.v1',observationSchema:ECHO_CATALOG_OBSERVATION_SCHEMA,catalog:{path:catalogPath,stamp:current.stamp,rowRevision:current.rowRevision},requested,sources,observations,missing};
 if(Buffer.byteLength(JSON.stringify(payload))>maxOutputBytes)throw Error('observation-output-byte-budget');
 return {...payload,revision:digest(payload),createdAt:new Date().toISOString(),readOnly:true,analysisCalls:0,modelCalls:0,
  metrics:{requested:requested.length,sources:sources.length,observations:observations.length,available:observations.filter(row=>row.status==='inferred-limited').length,inputBytes:loadedBytes,observationBytes:outputBytes}};
}
