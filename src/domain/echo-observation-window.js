export const ECHO_CATALOG_OBSERVATION_SCHEMA='hapa.echo.catalog-observation.v1';
const digest=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const finite=value=>typeof value==='number'&&Number.isFinite(value);

/** Only observations actually sampled inside the selected half-open SOURCE
 * window can contribute. Repeated provider rows are not independent votes. */
export function echoObservationsInSourceWindow(observations,{sourceSha256,startSeconds,endSeconds}={}) {
 if(!digest(sourceSha256)||!finite(startSeconds)||!finite(endSeconds)||startSeconds<0||endSeconds<=startSeconds)return {status:'unavailable',reason:'source-window-unverified',observations:[]};
 if(!Array.isArray(observations)||observations.length>6144)throw Error('observation-count-budget');
 const selected=new Map(),conflicts=new Set();
 for(const row of observations){
  if(row.schemaVersion!==ECHO_CATALOG_OBSERVATION_SCHEMA||row.status!=='inferred-limited'||row.sourceByteStatus!=='bytes-verified'||row.sourceSha256!==sourceSha256||!digest(row.revision)||!finite(row.pointSeconds)||row.pointSeconds<startSeconds||row.pointSeconds>=endSeconds)continue;
  const key=String(row.frameId),prior=selected.get(key);
  if(prior&&prior.revision!==row.revision)conflicts.add(key);
  else selected.set(key,row);
 }
 for(const key of conflicts)selected.delete(key);
 const result=[...selected.values()].sort((a,b)=>a.pointSeconds-b.pointSeconds||String(a.frameId).localeCompare(String(b.frameId)));
 return {status:result.length?'inferred-limited':'unavailable',reason:result.length?null:conflicts.size?'conflicting-observation-revisions':'no-sampled-evidence-in-source-window',observations:result,conflictingFrames:[...conflicts].sort(),coverage:'sampled-points-not-continuous-source-coverage'};
}
